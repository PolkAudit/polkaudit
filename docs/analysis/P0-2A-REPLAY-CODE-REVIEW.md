# P0–2A — Historical Replay Code Review

**Scope:** Local source-code review only (no production access, no code changes).  
**Date:** 2026-11-10  
**Inputs:** `apps/indexer/src/scanner.py`, `parser.py`, models/migrations, replay scripts, indexer tests.

---

## 1. Verdict

| Classification | Assessment |
|----------------|------------|
| Live-path idempotency (same height, `ProcessedBlock` present) | **Safe by design** for block/extrinsic/governance inserts gated on `processed_blocks` |
| Replay of already-indexed heights without deleting child rows | **Unsafe** — governance tables have **no** uniqueness constraints |
| Operational scripts (`reindex-range.sh`, `demo-backfill.sh`) | **Conditionally safe** if used exactly as written (stop indexer → delete/truncate → restart) |
| Intra-block dual-path (extrinsic + event) | **Risk of duplicates** for votes/treasury; proposals partially deduped via `seen_refs` for `Submitted` only |
| DLQ / interruption | **Recoverable cursor**, but **no automatic DLQ retry controller**; failed heights retry forever and may spam DLQ |

**Overall replay safety (code-only):** `CONDITIONALLY_SAFE` — matches prior P0–1 classification; not `SAFE_WITH_EVIDENCE` until uniqueness or delete-before-replay is mandatory in tooling tests.

---

## 2. How historical block processing works

There is **no separate historical replay worker** in the indexer. History is processed by the same `FinalizedScanner.run()` loop used for tip catch-up.

### 2.1 Flow (confirmed)

1. Poll `chain_getFinalizedHead` → `chain_getBlock` → parse finalized height (`scanner.py` `run`).
2. Read cursor: `MAX(processed_blocks.block_number)` via `get_last_processed_block`.
3. Choose next height: `_resolve_next_block(last_processed, finalized_number)`.
4. Resolve hash: `chain_getBlockHash(next_block)` → body via `chain_getBlock`.
5. `process_block`:
   - Skip if `ProcessedBlock` already exists for that number.
   - Fetch events (`parser.substrate.get_events`) in a thread pool; empty list on failure.
   - `ChainParser.parse_block(block_number, extrinsics, events)`.
   - Insert `Block`, `Extrinsic`s, proposals, votes, treasury spends, then `ProcessedBlock`.
   - Single `session.commit()`.
6. On failure: rollback of the process session; outer handler writes `DeadLetterQueue` and does **not** insert `ProcessedBlock`.

### 2.2 What “historical” means operationally

Scripts force the live scanner to re-walk a range by:

| Script | Mechanism |
|--------|-----------|
| `deploy/alibaba/reindex-range.sh` | Stop service → `DELETE` dependent rows for `block_number` range → set `INDEXER_START_BLOCK` → start service |
| `scripts/demo-backfill.sh` | Optional confirm → `TRUNCATE` indexer tables → optionally rewrite local `.env` start/window → operator restarts `./run.sh` |

Confirmed: no offline batch importer; no range-limited END stop in the scanner (END in `reindex-range.sh` only limits **deletes**; indexer still advances to tip).

---

## 3. Cursor management

| Function | Behavior |
|----------|----------|
| `get_last_processed_block` | `COALESCE(MAX(processed_blocks.block_number), 0)` |
| `_resolve_next_block` | (1) If `INDEXER_START_BLOCK > 0` and `last_processed < start - 1` → jump to start; (2) else if `last_processed == 0` → `max(1, finalized - INDEXER_CATCHUP_WINDOW)`; (3) else `last_processed + 1` |
| Advancement | Only after successful commit including `ProcessedBlock` |
| Skip | `session.get(ProcessedBlock, block_number)` early return |

**Confirmed implications:**

- Setting `INDEXER_START_BLOCK` **below** an existing high cursor does **nothing** without deleting higher `processed_blocks`.
- Catch-up window applies only on **empty** cursor (`last_processed == 0`) when start-block jump does not apply.
- Cursor is **monotonic forward** under normal operation; rewind is an **out-of-band delete**, not an API.

Config defaults: `INDEXER_CATCHUP_WINDOW=2000`, `INDEXER_START_BLOCK=0` (`apps/indexer/src/config.py`).

---

## 4. Duplicate risk under repeated processing

### 4.1 Same block, `ProcessedBlock` present

**Confirmed safe:** early return; no second insert of block/governance rows.

### 4.2 Same block, `ProcessedBlock` deleted but child rows left

**Confirmed unsafe:** `process_block` will insert new proposals/votes/spends (and may conflict on `blocks.block_number` unique). Governance tables would duplicate if block row already deleted or if only `processed_blocks` was cleared.

### 4.3 Concurrent two scanners / live + manual insert

**Confirmed race window:** check-then-insert is not transactional-lock based across processes. Two writers can both observe “no ProcessedBlock” then one wins on PK/`blocks` unique and the other fails → DLQ. Governance inserts before conflict are not uniquely constrained (ordering depends on flush).

### 4.4 Intra-parse dual path (same successful process)

| Entity | Dedup in `parser.py` | Risk |
|--------|----------------------|------|
| Proposals from `Referenda.Submitted` | `seen_refs` skips duplicate index vs extrinsic-built set | Good for Submitted |
| Outcome events (`Confirmed`, `Approved`, …) | **Append new `Proposal` rows** | Multiple rows per `proposal_index` by design |
| Votes | No dedup vs extrinsic votes | Possible extrinsic + `Voted` event duplicates |
| Treasury | Extrinsic path + `Awarded`/`SpendApproved` | Possible double spend rows in one block |

**Assumption requiring runtime verification:** how often both call and event fire with overlapping fields on Polkadot for the same extrinsic.

---

## 5. Database constraints (migrations + models)

| Table | Constraint evidence | Protects duplicates? |
|-------|---------------------|----------------------|
| `processed_blocks` | PK `block_number` (`b1c2d3e4f5a6`, indexer model) | Yes — cursor gate |
| `blocks` | unique `block_number`, unique `block_hash` | Yes — block re-insert |
| `extrinsics` | **no** unique on `(block_number, extrinsic_hash)` | **No** |
| `proposals` | index on `proposal_index` only (non-unique) | **No** |
| `votes` | indexes only | **No** |
| `treasury_spends` | indexes only | **No** |
| `dead_letter_queue` | no unique on `block_number` | Repeated failures → many rows |

Backend models (`apps/backend/src/models/proposal.py`) mirror lack of uniqueness; indexer `apps/indexer/src/models.py` same.

---

## 6. Interrupted processing

| Scenario | Code behavior |
|----------|---------------|
| Crash mid-transaction | No commit → no `ProcessedBlock` → next loop retries same height |
| Parse timeout / exception | Inner rollback; outer DLQ insert + commit; cursor unchanged → retry next loop |
| Process kill after commit | Height permanently marked; continues at `max+1` |
| Cancelled task | `CancelledError` breaks `run()` loop cleanly |

**Gaps (confirmed):**

- `DeadLetterQueue.retry_count` exists but **nothing increments it or drains DLQ**.
- Permanent parse bugs → **infinite retry** of the same height + **unbounded DLQ growth**.
- No “poison block skip” / max-retry escalate.

**Test coverage note:** `apps/indexer/tests/test_scanner.py` mocks a happy path only; assertion expects `parse_block(100, [])` while production calls include `events` — test is **stale relative to current signature** (code smell; not runtime-proven failure).

Parser unit tests (`test_parser.py`) cover call classification without RPC; they do **not** cover dual-path dedup or scanner commit/DLQ.

---

## 7. Unresolved technical risks

| # | Risk | Status |
|---|------|--------|
| R1 | No unique keys on proposals/votes/treasury | Confirmed defect for idempotent replay |
| R2 | Dual-path vote/spend duplication | Confirmed code path; frequency unverified |
| R3 | Outcome events create additional proposal rows (not updates) | Confirmed |
| R4 | `INDEXER_START_BLOCK` cannot rewind cursor alone | Confirmed |
| R5 | `reindex-range.sh` END does not stop indexing at END | Confirmed |
| R6 | Event fetch failures silently become `[]` | Confirmed — may under-index without failing the block |
| R7 | Extrinsic `success` hard-coded `"True"` | Confirmed — failed calls may still classify |
| R8 | Archive RPC required for deep history | Assumption (industry + prior P0–1 RPC 403); not re-tested here |
| R9 | Parallel live indexer + incomplete delete | Operational hazard |
| R10 | Proposal index fallback to extrinsic index when args lack ref | Confirmed in `_build_proposal` |

---

## 8. Confirmed findings vs assumptions

### Confirmed (source)

- Single-loop scanner is the only replay engine.
- Idempotency depends on `processed_blocks` + delete-all-children discipline.
- Scripts that delete all range tables then restart are the intended safe path.
- Governance uniqueness is absent by schema.
- DLQ is write-only telemetry, not a recovery workflow.

### Assumptions (need future local/runtime verification)

- Exact Subscan/Dune blocks decode cleanly with current whitelist.
- Public vs archive RPC event availability at chosen START.
- Real duplicate rates from extrinsic+event on known spends/votes.
- Whether production ever ran incomplete deletes.

---

## 9. Recommendation (architecture only)

Prefer hardening the **existing** scanner + `reindex-range` pattern before inventing a second pipeline: add uniqueness / upsert, exclusive lock, range END, DLQ max-retry, and a local dry-run harness. Detailed design: [P0-2A-SAFE-BACKFILL-PLAN.md](./P0-2A-SAFE-BACKFILL-PLAN.md).

**STOP for P0–2A Task 1.**
