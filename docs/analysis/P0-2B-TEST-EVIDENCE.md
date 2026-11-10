# P0–2B Stage A — Test Evidence

**Date:** 2026-11-10  
**Environment:** Local macOS; isolated Postgres database `polkaudit_p02b_test` on `localhost`  
**Production / shared DBs:** not contacted  

---

## 1. Command

```bash
createdb polkaudit_p02b_test   # once

cd apps/indexer
P02B_TEST_DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
python3 -m pytest tests/ -v --tb=short
```

Schema for tests: SQLAlchemy `create_all` from updated models (equivalent constraints to migration `g7h8i9j0k1l2`). Alembic was **not** run against any shared database.

---

## 2. Result summary

| Metric | Value |
|--------|-------|
| Collected | 30 |
| Passed | **30** |
| Failed | 0 |
| Duration | ~1.6s |

---

## 3. Scenario coverage (assert identity, not only counts)

| # | Requirement | Test | Evidence asserted |
|---|-------------|------|-------------------|
| 1 | Identical event twice | `test_01_identical_event_processed_twice` | Same `event_key`; `COUNT=1`; value/beneficiary unchanged |
| 2 | Two identical-value treasury payments | `test_02_multiple_identical_value_treasury_in_one_block` | Two keys `…:e:0…` / `…:e:1…`; `COUNT=2` |
| 3 | Vote changes same account | `test_03_vote_changes_same_account` | Distinct keys; Aye then Nay; `COUNT=2` after re-insert |
| 4 | Missing historical block | `test_04_missing_historical_block_does_not_advance` | No `ProcessedBlock` for N+1; cursor unchanged |
| 5 | RPC event-fetch failure | `test_05_rpc_event_fetch_failure` | No processed row; DLQ written; error raised |
| 6 | Interrupted transaction | `test_06_interrupted_transaction_no_partial_commit` | Zero blocks/proposals after parse boom |
| 7 | Restart after failure | `test_07_restart_after_failure_resumes_same_height` | Second `process_block` idempotent; one proposal; cursor at height |
| 8 | Concurrent writers | `test_08_concurrent_writer_lock` | Second `WriterLock.acquire` → `ExclusiveLockError` |
| 9 | Explicit end boundary | `test_09_explicit_end_boundary` (+ `test_resolve_end_block`) | `next is None` past END; invalid START/END raises |
| 10 | API compatibility | `test_10_api_compatibility_proposal_fields` | Response model validates without requiring `event_key` |

Additional:

- `test_cursor_rejects_gap_and_bootstrap_does_not_claim_false_span` — gapped `processed_blocks` → tip-only cursor; `advance_cursor` rejects skip  
- `test_lifecycle_proposal_events_keep_distinct_keys` — Submitted+Confirmed share `proposal_index`, distinct `event_key`, idempotent re-insert  
- Parser/unit/scanner suite remains green (30 total)

---

## 4. Identity preservation statement

Passing tests show that for the exercised fixtures:

1. Re-inserting the **same** `event_key` does not increase row count **and** leaves the stored key/value fields equal to the first insert.  
2. Distinct chain positions (event/extrinsic index) produce distinct keys even when business fields (beneficiary, amount, voter, poll) match.  

This is **local fixture evidence**, not a production backfill proof. Do not equate “30 passed” with production replay safety without Stage B reconciliation.

---

## 5. Warnings observed

- Pydantic v2 `Field(env=…)` deprecation (pre-existing style)  
- One `AsyncMock` “never awaited” warning in mocked `test_scanner_processes_block` (test harness only)

---

## 6. Stage B readiness from test view

| Item | Status |
|------|--------|
| Local identity + idempotency | Evidenced |
| Local exclusive lock | Evidenced (Postgres advisory) |
| Contiguity cursor semantics | Evidenced |
| Live RPC / archive decode | **Not evidenced** here |
| Alembic on shared DB | **Not run** |
| Golden-block reconciliation | **Deferred to Stage B** |

**STOP.**
