# P0–2A — Safe Historical Backfill Plan

**Scope:** Architecture recommendation only. No implementation, migrations, or execution in this gate.  
**Date:** 2026-11-10  
**Basis:** [P0-2A-REPLAY-CODE-REVIEW.md](./P0-2A-REPLAY-CODE-REVIEW.md), [P0-2A-DATA-CONSISTENCY-DESIGN.md](./P0-2A-DATA-CONSISTENCY-DESIGN.md), [P0-2-BACKFILL-READINESS.md](./P0-2-BACKFILL-READINESS.md)

---

## 1. Recommendation summary

| Item | Choice |
|------|--------|
| Strategy | **Evolve the existing** `FinalizedScanner` + `reindex-range.sh` pattern |
| Isolation | Local Docker Postgres + fixture/RPC replay first; production only after P0–2 authorization |
| Idempotency | Keep `processed_blocks` gate; **add** logical unique keys / upsert for governance |
| Cursor | Explicit rewind protocol (transactional range delete) + optional `INDEXER_END_BLOCK` |
| Safety class after improvements | Target: `SAFE_WITH_EVIDENCE` under exclusive writer + uniqueness |
| Current class without changes | `CONDITIONALLY_SAFE` (delete-all-children + stop indexer) |

**Decision for future execution authorization:** remain aligned with P0–2 **`CONDITIONAL GO`** until entry criteria and the hardening checklist below are met.

---

## 2. Design goals (mapped)

| Goal | Approach |
|------|----------|
| Isolated local testing | Compose: Postgres + mocked/recorder RPC or archive endpoint; never point local experiments at prod DB |
| Idempotent processing | Uniqueness + `ON CONFLICT DO NOTHING` / upsert; re-run same range → zero net row growth |
| Duplicate detection | Pre/post count queries + unique violation metrics; CI fixture with dual-path events |
| Historical event validation | Golden-file tests from known Subscan/Dune references (P0–1 §C) |
| Reliable cursor management | Single writer; transactional delete of range; start/end bounds |
| Failure recovery | DLQ with max retries + poison-block quarantine; resume from `MAX(processed)` |
| Data integrity checks | Invariants I1–I7 from data-consistency design |

---

## 3. Target architecture (prefer existing components)

```text
                    ┌─────────────────────┐
                    │  Exclusive lock     │
                    │  (advisory / flock) │
                    └─────────┬───────────┘
                              │
     ┌────────────────────────▼────────────────────────┐
     │           FinalizedScanner (unchanged role)      │
     │  _resolve_next_block → process_block → commit    │
     └───────────┬─────────────────────┬────────────────┘
                 │                     │
        processed_blocks            proposals / votes /
        blocks / extrinsics         treasury (UNIQUE keys)
                 │
                 ▼
        Integrity checker (read-only SQL)
                 │
                 ▼
        Reconciliation report vs golden refs
```

**Do not** introduce a second independent writer that shares tables without the same lock and schema rules.

### 3.1 Proposed schema hardening (future migration — not in this gate)

| Table | Suggested unique key (illustrative) |
|-------|-------------------------------------|
| `proposals` | `(proposal_index, block_number, section, method)` or upsert-by-index for lifecycle |
| `votes` | `(block_number, voter, proposal_index, vote)` (+ extrinsic hash when available) |
| `treasury_spends` | `(block_number, beneficiary, value)` or include event/extrinsic id |
| `extrinsics` | `(block_number, extrinsic_hash)` |

Also: store optional `source` (`extrinsic`|`event`) and `extrinsic_hash` for provenance.

### 3.2 Parser improvements (future code)

- Extend `seen_refs`-style dedup to votes/treasury within a block.
- Prefer **update** proposal status on outcome events instead of inserting sibling rows (or keep append model but document multi-row semantics in APIs).
- Fail closed (or mark block degraded) when event fetch fails if policy requires events.
- Cap DLQ retries; after N failures insert quarantine row and **advance** only under explicit flag.

### 3.3 Scanner / config improvements (future code)

| Feature | Purpose |
|---------|---------|
| `INDEXER_END_BLOCK` | Stop after historical window without racing to tip during tests |
| Advisory lock / single-instance guard | Prevent dual writers |
| `BACKFILL_MODE=1` | Require delete-range checklist; refuse if tip writer detected |
| Metrics: duplicates skipped, DLQ size | Operability |

### 3.4 Script improvements (future ops tooling)

Evolve `reindex-range.sh` to:

1. Acquire lock / assert indexer stopped.
2. Begin transaction: delete **all** dependent tables for range (current order is already correct).
3. Verify zero orphans in range.
4. Set START (and END if implemented).
5. Start indexer.
6. Emit post-counts + invariant SQL.

Keep `demo-backfill.sh` **local/demo only** (TRUNCATE) — not for production.

---

## 4. Local verification ladder (before any shared/prod DB)

| Step | Action | Pass |
|------|--------|------|
| L1 | Unit: parser fixtures for ref 1674-class events + treasury Awarded | Expected rows; no dups |
| L2 | Scanner integration with mocked RPC + empty Postgres | Cursor advances; re-process skipped |
| L3 | Delete `processed_blocks` only (negative test) | Must **fail** or conflict until uniqueness exists — documents hazard |
| L4 | Full delete-range then replay twice | Second pass: Δ counts = 0 |
| L5 | Kill mid-range, restart | Resume without wipe |
| L6 | Golden reconcile against independently documented chain events | Per P0–2 exit template |

---

## 5. Controlled backfill procedure (when separately authorized)

Aligned with P0–2 readiness; refined for safety:

1. **Preflight:** DB fingerprint parity (indexer↔API); archive RPC smoke on one reference block; backup/snapshot acknowledged.
2. **Exclusive:** stop live indexer; no parallel jobs.
3. **Scope:** START covering ≥ known OpenGov + treasury refs; optional END for staged windows.
4. **Delete range** (all child tables + processed) — never processed-only.
5. **Start** single indexer with START set; monitor governance log lines + DLQ.
6. **Reconcile** against golden refs (identifiers + planck), not “non-zero KPIs.”
7. **Release:** clear END / allow tip catch-up; restart normal ops.
8. **Abort criteria:** uniqueness violations, DLQ growth without progress, wrong `proposal_index`, cursor jump past END unexpectedly.

---

## 6. Acceptance criteria linkage

Reuse and strengthen [P0-2-BACKFILL-READINESS.md](./P0-2-BACKFILL-READINESS.md) X1–X12:

- Add **X13:** second full pass over same range adds zero governance rows.
- Add **X14:** integrity checker I1–I4 green on reindexed range.
- Add **X15:** documented exclusive-lock evidence in run log.

Non-goals remain: full-chain genesis backfill in one shot; concurrent multi-writer.

---

## 7. Risk residual after plan (honest)

| Risk | Residual |
|------|----------|
| Incomplete OpenGov lifecycle modeling | Remains until product schema expands |
| Planck vs DOT UI labeling | Separate defect; must not gate “financial correctness” on UI alone |
| RPC archive gaps | Operational; cannot be coded away |
| Dual ORM models (indexer vs backend) | Drift until shared package |

---

## 8. GO posture for *implementation work* vs *execution*

| Activity | Recommendation |
|----------|----------------|
| Implement local hardening + tests (future coding milestone) | **GO** when product authorizes engineering work |
| Run destructive reindex against shared/prod DB | **CONDITIONAL GO** per P0–2 entry criteria only |
| Blind truncate + tip-window catch-up | **NO-GO** as a credibility strategy |

---

## 9. Deliverable status

| Document | Role |
|----------|------|
| `P0-2A-REPLAY-CODE-REVIEW.md` | Code findings on replay/cursor/dup/DLQ |
| `P0-2A-DATA-CONSISTENCY-DESIGN.md` | Stats/config inconsistency mechanisms |
| `P0-2A-SAFE-BACKFILL-PLAN.md` | This plan |

**P0–2A complete. Stop.** Do not execute backfill or modify application code under this authorization.
