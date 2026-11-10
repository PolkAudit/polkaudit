# P0–1 — Governance & Treasury Data Verification Report

**Authorization:** Read-only verification only  
**Date:** 2026-11-10  
**Baseline:** Feature-gap assessments under `docs/analysis/`  
**Boundaries observed:** No code changes, migrations, production writes, backfill, deploys, restarts, credential changes, or commits.

---

## 1. Verdict (short)

| Question | Answer |
|----------|--------|
| Why does the dashboard show zero proposals / votes / treasury? | **Verified (DB):** The shared Neon database contains **3,442 blocks / 7,241 extrinsics** and **0 proposals, 0 votes, 0 treasury_spends**. Governance tables are empty despite non-empty block/extrinsic tables. |
| Is short catch-up the *sole* cause? | **No.** Catch-up explains how a *fresh* DB can miss history, but the **current** cursor sits in a narrow high range (`32798499`–`32801940`) with **no matched governance**, and indexing appears **stalled** since `2026-09-01`. `INDEXER_START_BLOCK=31370000` is **below** the cursor and does **not** force re-scan of that start height. |
| Parser completely broken? | **Not proven.** Unit tests cover Referenda/Democracy/Conviction/Treasury; **hypothesis** remains that this slice lacked matched calls/events and/or event decode yielded nothing useful. |
| Same DB for indexer & API (local env)? | **Verified:** indexer and backend `.env` point at the **same Neon host fingerprint**. |
| Live public API stats? | **Blocked:** `https://api.polkaudit.xyz/api/v1/stats/overview` → **403** with local key (cannot confirm prod API key/DB binding from this gate). |
| Console availability? | **Observed:** `https://console.polkaudit.xyz` failed HTTP check from this environment; API `/health` OK; app host OK. |

**P0–2 posture:** See [P0-2-BACKFILL-READINESS.md](./P0-2-BACKFILL-READINESS.md) → **`CONDITIONAL GO`**.

---

## 2. A — Verified implementation (repository)

### A.1 Indexer cursor initialization & advancement

| Topic | Precise functions | Behavior |
|-------|-------------------|----------|
| Read cursor | `FinalizedScanner.get_last_processed_block` — `apps/indexer/src/scanner.py` | `MAX(processed_blocks.block_number)` or `0` |
| Choose next | `_resolve_next_block(last_processed, finalized_number)` | (1) If `INDEXER_START_BLOCK > 0` and `last_processed < start-1` → jump to start; (2) else if `last_processed == 0` → `finalized - INDEXER_CATCHUP_WINDOW`; (3) else `last_processed + 1` |
| Advance | `run()` loop after successful `process_block` commit | Only advances when `ProcessedBlock` row committed |
| Skip duplicate | `process_block` | `session.get(ProcessedBlock, block_number)` → return if exists |

**Config:** `apps/indexer/src/config.py` — `INDEXER_START_BLOCK`, `INDEXER_CATCHUP_WINDOW` (default 2000 in code; local env currently **25000**).

### A.2 Catch-up window

Applies **only** when `last_processed == 0` **and** start-block jump does not apply. It does **not** rewind an existing high cursor. Setting `INDEXER_START_BLOCK` below current max **has no effect** without deleting higher `processed_blocks` (and related rows).

### A.3 Finalized-block processing

| Step | Function | RPC |
|------|----------|-----|
| Tip | `get_finalized_head` | `chain_getFinalizedHead` via HTTP POST to `SUBSTRATE_RPC_URL` |
| Tip body | `get_block` | `chain_getBlock` |
| Hash by number | `get_block_hash` | `chain_getBlockHash` |
| Events | `_fetch_events_sync` → `parser.substrate.get_events` | substrate-interface (typically WS under same URL) |
| Parse | `ChainParser.parse_block` | Extrinsics + events |

### A.4 Persistence (proposals / votes / spends)

| Entity | Writer | Table |
|--------|--------|-------|
| Block / extrinsics | `process_block` | `blocks`, `extrinsics` |
| Governance | `session.add_all(parsed_data['proposals'|'votes'|'treasury_spends'])` | `proposals`, `votes`, `treasury_spends` |
| Cursor | `ProcessedBlock(block_number, block_hash)` | `processed_blocks` |
| Failures | outer `except` → `DeadLetterQueue` | `dead_letter_queue` |

Match sets: `GOVERNANCE_PROPOSAL_CALLS`, `GOVERNANCE_VOTE_CALLS`, `TREASURY_SPEND_CALLS`, `GOVERNANCE_EVENTS` in `apps/indexer/src/parser.py`.

**Confirmed gap:** several whitelisted events have no persistence branch (documented in prior assessment).

### A.5 API database connectivity

| Component | Path |
|-----------|------|
| Stats | `StatsService.get_overview` — `apps/backend/src/services/stats.py` |
| Models | `Proposal`, `Vote`, `TreasurySpend`, indexer `Block`/`Extrinsic`/`ProcessedBlock` |
| Routes | `GET /api/v1/stats/overview`, `/proposals`, `/treasury/spends` — `apps/backend/src/api/v1/router.py` |

Queries are **global counts/lists** (no project filter) — shared index by design.

### A.6 Governance / treasury API query behavior

- Overview: `COUNT` proposals/votes; `SUM(cast(value as numeric))` treasury; block/extrinsic counts; lag fields.  
- Empty governance tables → zeros even when blocks/extrinsics ≫ 0 (**matches live symptom**).

### A.7 Event decoding / RPC payload formats

| Path | Notes |
|------|-------|
| Extrinsics | Decoded via substrate-interface in `parse_block` |
| Events | Normalized via `module_id` / `event_module` / `pallet` and `event_id` / `event_method` / `method` |
| Failure mode | `_fetch_events_sync` returns `[]` on exception (logged at debug) — extrinsic-only fallback |

**Not verified in this gate:** whether production event dict shapes always hit handlers (would need RPC event dump for a known block).

### A.8 Historical replay scripts

| Script | Path | Effect |
|--------|------|--------|
| Range reindex | `deploy/alibaba/reindex-range.sh` | **Stops indexer**, `DELETE` votes/proposals/treasury/extrinsics/blocks/processed for range, sets `INDEXER_START_BLOCK`, **starts indexer** |
| Demo reset | `scripts/demo-backfill.sh` | **TRUNCATE** indexer tables (destructive) |
| Counts helper | `scripts/check-governance-data.sh` + `scripts/_governance_db.py` | Read-only counts (+ optional API) |

---

## 3. B — Production / shared-DB verification (read-only)

### B.1 Access used

- Local `apps/indexer/.env` + `apps/backend/.env` (existing workspace config).  
- **SELECT-only** aggregates via `asyncpg`.  
- **No** secrets printed (host fingerprint only).  
- Public HTTPS probes for health/UI.  
- Public `rpc.polkadot.io` JSON-RPC from this environment returned **403** — historical RPC from agent host **not verified**.

### B.2 Database results (verified)

| Metric | Value |
|--------|-------|
| Neon host (indexer vs backend) | **Same** (`ep-little-union-aojo6kfd-pooler…neon.tech`) |
| `INDEXER_START_BLOCK` (env) | `31370000` |
| `INDEXER_CATCHUP_WINDOW` (env) | `25000` |
| `blocks` | **3442** |
| `extrinsics` | **7241** |
| `proposals` | **0** |
| `votes` | **0** |
| `treasury_spends` | **0** |
| `processed_blocks` | **3442** |
| `dead_letter_queue` | **0** |
| `processed_blocks` min/max | **32798499 / 32801940** |
| `blocks` min/max | **32798499 / 32801940** |
| Latest `processed_at` | **2026-09-01 23:27:01+00** |
| proposals/votes/spends min/max | n/a (empty) |

### B.3 Interpretation (confirmed vs hypothesis)

| Finding | Class |
|---------|-------|
| Dashboard zeros because governance tables empty while blocks exist | **Confirmed** (DB) |
| Indexed span is only ~3.4k consecutive heights near 32.80M | **Confirmed** |
| No DLQ rows in this DB | **Confirmed** |
| Indexer not advancing for ~2+ months (relative to verification date) | **Confirmed** (timestamp) |
| `INDEXER_START_BLOCK=31370000` inactive relative to cursor | **Confirmed** (logic + data) |
| This Neon DB is exactly what production API serves | **Hypothesis / partially blocked** (API stats 403; host match in local env only) |
| Parser failed to decode all OpenGov in that range | **Hypothesis** (needs block-level extrinsic/event audit) |
| Catch-up window alone caused current empty governance | **Rejected as sole cause** for *current* state |

### B.4 Checks blocked / incomplete

| Check | Status | Requirement |
|-------|--------|-------------|
| Prod API `/stats/overview` with authorized key | **Blocked** (403) | Authorized API key or SAS-side curl |
| Confirm prod API `DATABASE_URL` host equals Neon above | **Blocked** | Ops read of `/etc/polkaudit/backend.env` (no paste of secrets) |
| Indexer systemd active + logs | **Not run** | Would require SAS SSH; restart forbidden in this gate |
| Public RPC historical hash/events | **Blocked** (403 from agent network) | Archive/public RPC reachable from indexer host |
| Event payload shape on a known block | **Not verified** | Read-only decode on authorized RPC |

---

## 4. C — Historical reference events (no backfill)

Examples chosen from public explorers / Dune (evidence sources below). Block hashes **not** resolved from this environment (RPC 403).

| # | Kind | Reference | Approx block | Expected PolkAudit row | Parser support today | Evidence source | RPC note |
|---|------|-----------|--------------|------------------------|----------------------|-----------------|----------|
| 1 | OpenGov referendum lifecycle | Referendum **1674** Confirmed | start ~**26863938**; end ~**26923064** | `proposals` with `proposal_index=1674`, status progression | **PARTIAL** — `Referenda.submit` / `Submitted` / outcome events; tracks/deposits incomplete | [Dune OpenGov](https://dune.com/substrate/polkadot-opengov-active-referenda); Polkassembly/Subscan referenda | Deep history likely needs **archive** node |
| 2 | OpenGov referendum | Referendum **1676** Decision Started | ~**26875641** | proposal row / DecisionStarted | **PARTIAL** — `DecisionStarted` whitelisted but **no handler** | Dune | Archive |
| 3 | Treasury spend (OpenGov-linked) | Subscan treasury spend **#201** | created ~**28040602** | `treasury_spends` beneficiary+value (planck) | **PARTIAL** — `Treasury`/`Spender` calls + `Awarded`/`SpendApproved`; no referendum FK | [Subscan treasury spend 201](https://polkadot.subscan.io/treasury_spend/201) | Archive for that era |
| 4 | Treasury-related referenda examples | Root referenda with Treasury spend actions (e.g. list entries citing `Treasury (spend)` / `spend_local`) | varies (e.g. mid-2024 list on Subscan) | proposal + later spend | Proposal call set includes Referenda; spend separate | [Subscan referenda list](https://polkadot.subscan.io/referenda_v2_list?origin=root) | Archive |
| 5 | Conviction voting | Any block with `ConvictionVoting.vote` / `Voted` near active refs | near active OpenGov periods | `votes` with `proposal_index` | **PARTIAL** — call + `Voted` event supported | Subscan extrinsic explorer (per-ref) | Prefer recent tip-adjacent for non-archive RPC |

**Configured RPC in local indexer env:** host `rpc.polkadot.io` (public). **Whether that endpoint can serve historical `get_events` for blocks ≪ tip was not verified here (403).** Industry practice: pruned public nodes often cannot serve deep historical state; **archive-capable provider recommended for P0–2 ranges ≪ tip**.

**Demo script default start** `31370000` (`scripts/demo-backfill.sh`) is **above** the Dune examples (~26.8M) and **below** current DB max (~32.80M) — choosing start height must be deliberate for the events above.

---

## 5. D — Replay & deduplication safety

### Uniqueness (schema evidence)

| Table | Uniqueness | Implication |
|-------|------------|-------------|
| `processed_blocks` | PK `block_number` | Natural idempotency gate for scanner |
| `blocks` | unique `block_number`, `block_hash` | Re-insert same block without delete → conflict |
| `extrinsics` | **no** unique on `(block_number, extrinsic_hash)` | Duplicates possible if reprocessed without delete |
| `proposals` | PK `id` only; `proposal_index` **not unique** | Lifecycle duplicates / replay duplicates possible |
| `votes` | no composite unique | Duplicates possible |
| `treasury_spends` | no composite unique | Extrinsic+event double insert / replay duplicates possible |

### Scenario classification

| Scenario | Classification | Evidence |
|----------|----------------|----------|
| Re-run scanner over already processed block (no deletes) | `SAFE_WITH_EVIDENCE` | Early return if `ProcessedBlock` exists |
| `reindex-range.sh` exclusive: stop → DELETE range (all listed tables) → set start → start | `CONDITIONALLY_SAFE` | Script design; **requires** exclusive indexer ownership; deletes are destructive for that range |
| Delete only `processed_blocks` then resume | `UNSAFE` | Would re-parse and `add_all` proposals/votes/spends without unique protection |
| Live indexer + concurrent range replay without stop | `UNSAFE` | Cursor races; duplicate/conflict risk |
| `demo-backfill.sh` truncate | `UNSAFE` for production (full wipe of indexer tables) | Explicit TRUNCATE |
| Resume after crash mid-block | `CONDITIONALLY_SAFE` | Failed path writes DLQ; successful path commits atomically; **stuck retry** of same height if parse always fails (DLQ count 0 in current DB) |
| Deep historical RPC on public pruned node | `NOT_VERIFIED` / likely insufficient | Agent RPC 403; archive recommended |

**Overall replay safety for P0–2:** **`CONDITIONALLY_SAFE`** only when using the **stop + delete-range + single indexer** procedure (or equivalent), never overlapping writers.

---

## 6. Confirmed defects vs hypotheses (this gate)

### Confirmed

1. Empty governance/treasury tables with non-empty blocks/extrinsics (DB).  
2. Narrow indexed height band; cursor stale since 2026-09-01.  
3. Start-block env below cursor → ineffective without reindex delete.  
4. No uniqueness on proposals/votes/spends → unsafe naive replay.  
5. Local indexer/backend DB host match.  
6. Public API stats unauthorized (403); Console HTTPS check failed from this env.  
7. Prior confirmed code defects still stand (proposal `id` vs `proposal_index` UI; planck labeled DOT in reports/alerts) — out of scope to fix here.

### Hypotheses (remaining)

1. Indexed 32.80M slice simply contained no matched OpenGov/treasury extrinsics/events.  
2. Event fetch returned empty for many blocks (silent `[]`).  
3. Production API might still point at a different DB than this Neon (403 blocked proof).  
4. Indexer process down on SAS (not inspected; restart forbidden).

---

## 7. Remaining risks

- Backfill without archive RPC → silent empty governance again.  
- Backfill without exclusive lock → duplicates/corruption.  
- Choosing start height that still misses known referenda (~26.8M examples).  
- Assuming non-zero dashboard counts alone prove correctness (identifiers/units/dedup matter).  
- Console/auth ops issues parallel to indexing.

---

## 8. Recommendation

**Do not start P0–2 until:**

1. Ops confirms this Neon is the production API database (or provides matching read-only counts).  
2. Indexer liveness plan approved (restart is a **separate** authorization — not performed here).  
3. Archive-capable RPC selected for the chosen historical range.  
4. Exclusive `reindex-range.sh`-style procedure accepted.

→ Detailed entry/exit criteria and GO decision: [P0-2-BACKFILL-READINESS.md](./P0-2-BACKFILL-READINESS.md).

**STOP. P0–1 complete. Awaiting separate authorization for P0–2.**
