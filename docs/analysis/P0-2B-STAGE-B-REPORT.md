# P0–2B Stage B — Historical Integrity Validation Report

**Authorization:** Local development and testing only  
**Date:** 2026-11-10  
**Prior:** Stage A (30 tests) + P0–2A/P0–1 analysis  

---

## 1. Verdict

| Decision for isolated end-to-end backfill test | **CONDITIONAL GO** |
|-----------------------------------------------|--------------------|
| Meaning | Local integrity, golden fixtures, and real Alembic upgrade on a disposable DB are evidenced. An **isolated** E2E backfill (dedicated local/staging DB + archive RPC + exclusive writer) may proceed under separate authorization. |
| Why not unconditional GO | No native `Treasury.Awarded` disbursement fixture; Voted events lack `poll_index` (extrinsic-dependent); shared/prod migration not applied; no archive soak on multi-day ranges. |
| Why not NO-GO | Chain-captured fixtures parse correctly; conflicts fail loudly; gaps are explicit; migration preserves legacy rows. |

---

## 2. Task outcomes

### Task 1 — Event identity integrity

- v2 `event_key` embeds `{chain_id}/{block_hash}/{block_number}:…` (`apps/indexer/src/identity.py`).  
- Identical payload replay → no insert (`insert_entities_idempotent`).  
- Same key + conflicting financial/governance fields → `IntegrityConflictError` (no silent discard).  
- Block hash mismatch on same height → integrity failure.  
- API contracts unchanged (extra columns ignored).  

### Task 2 — Cursor / coverage

- `indexer_cursor` carries `historical_gaps` + `coverage_complete` (never auto-true from MAX).  
- `coverage_status()` distinguishes forward progress, verified contiguous range, and gaps.  
- Jump/start below tip records `below_verified_range`.  
- Interruption/resume tested (`test_b07`).  

### Task 3 — Alembic

- Disposable DB upgraded `f6a7b8c9d0e1` → `g7h8i9j0k1l2` with legacy rows.  
- Evidence: [P0-2B-MIGRATION-VALIDATION.md](./P0-2B-MIGRATION-VALIDATION.md).  

### Task 4 — Golden fixtures

- Captured from live Polkadot RPC; offline pytest.  
- Evidence: [P0-2B-GOLDEN-EVENT-EVIDENCE.md](./P0-2B-GOLDEN-EVENT-EVIDENCE.md).  
- Added parser support for `Treasury.AssetSpendApproved`.  

### Task 5 — Replay regression

- Stage B suite `tests/test_stage_b_replay.py` + golden + Stage A suites.  
- **47 passed** locally on `polkaudit_p02b_test`.  

---

## 3. Modified file inventory (Stage B delta)

| Path | Change |
|------|--------|
| `apps/indexer/src/identity.py` | Chain + block hash in keys |
| `apps/indexer/src/integrity.py` | **New** conflict detection |
| `apps/indexer/src/persistence.py` | Conflict-aware inserts; coverage_status; gaps |
| `apps/indexer/src/parser.py` | block_hash plumbing; AssetSpendApproved; Voted without poll skip |
| `apps/indexer/src/scanner.py` | Passes block_hash into parse_block |
| `apps/indexer/src/models.py` | Cursor gaps / coverage_complete |
| `apps/backend/src/models/indexer.py` | Matching cursor fields |
| `apps/backend/migrations/versions/g7h8i9j0k1l2_*.py` | Gaps + coverage_complete in cursor bootstrap |
| `apps/indexer/tests/fixtures/golden/*` | **New** recorded fixtures |
| `apps/indexer/tests/test_golden_fixtures.py` | **New** |
| `apps/indexer/tests/test_stage_b_replay.py` | **New** |
| `apps/indexer/tests/test_identity.py` / replay / parser / scanner | Updated for v2 keys |

---

## 4. Tests executed

```bash
cd apps/indexer
P02B_TEST_DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
python3 -m pytest tests/ -q
# 47 passed
```

Plus Alembic validation on `polkaudit_p02b_mig_test` (see migration doc).

---

## 5. Known limitations

1. **Voted event path** cannot bind `proposal_index` without `poll_index` in attributes — extrinsic path required.  
2. **Disbursement** (`Treasury.Awarded` / payout) for spend #201 not fixture-captured.  
3. Beneficiary for asset spends is stringified MultiLocation — fine for integrity, awkward for UX.  
4. Legacy migrated rows keep synthetic keys until reindexed.  
5. Public RPC worked for these historical heights in this session; archive still required for reliability at scale.  

---

## 6. Remaining production prerequisites

1. Change-controlled apply of `g7h8i9j0k1l2` after duplicate assessment.  
2. Deploy indexer with v2 identity + conflict handling + exclusive lock.  
3. Isolated E2E backfill DB (not prod) with archive RPC, START/END, lock, golden reconciliation.  
4. Capture/disbursement fixture before claiming full treasury lifecycle coverage.  
5. Explicit authorization for any shared-environment operation.  

---

## 7. Recommendation

**CONDITIONAL GO** for an **isolated** end-to-end backfill test (local or disposable staging DB only), contingent on:

- Migration applied on that isolated DB  
- Archive-capable RPC  
- Exclusive writer  
- Reconciliation against golden refs in [P0-2B-GOLDEN-EVENT-EVIDENCE.md](./P0-2B-GOLDEN-EVENT-EVIDENCE.md)  

**NO-GO** for production historical replay until those prerequisites and a separate production authorization exist.

**STOP.** Await authorization for isolated E2E backfill (or further stages).
