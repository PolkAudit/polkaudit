# P0–3 — Regression Results

**Date:** 2026-11-10  
**Databases:** disposable `polkaudit_p02b_test` (indexer), `polkaudit_p03_test` (backend), `polkaudit_p03_mig` (Alembic)  

---

## 1. Commands

```bash
# Indexer (includes P0-3 + prior Stage B suites)
cd apps/indexer
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
P02B_TEST_DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
python3 -m pytest tests/ -q
# → 54 passed

# Backend P0-3
cd apps/backend
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p03_test' \
P03_TEST_DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p03_test' \
API_KEY='p03-test-key' \
python3 -m pytest tests/test_p03_correctness.py -q
# → 5 passed

# Migration compatibility (disposable)
createdb polkaudit_p03_mig
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p03_mig' API_KEY='x' \
  alembic upgrade head
# → includes h8i9j0k1l2m3
```

---

## 2. Scenario coverage

| # | Scenario | Result |
|---|----------|--------|
| 1 | Spurious referendum id (`Referenda.submit` without index) | **PASS** — no proposal row; golden Submitted keeps 1674 only |
| 2 | Deterministic lifecycle ordering | **PASS** — Confirmed wins over Submitted regardless of insert order; repeated detail identical |
| 3 | DOT raw-unit conversion | **PASS** |
| 4 | USDC asset-native units (spend #201 fixture) | **PASS** — 795500 display, 6 decimals |
| 5 | Unknown asset metadata | **PASS** — unresolved, no symbol |
| 6 | Mixed-asset aggregation protection | **PASS** — `mixed_refused` |
| 7 | CSV export correctness | **PASS** — no `value_planck`; USDC fields present; one proposal row per index |
| 8 | Report/alert unit consistency | **PASS** — no DOT label on USDC |
| 9 | Existing API compatibility | **PASS** — core Proposal/Treasury/Stats schemas validate |
| 10 | Historical replay identity stability | **PASS** — second insert Δ=0, same `event_key` |

---

## 3. Totals

| Suite | Passed |
|-------|--------|
| Indexer `tests/` | **54** |
| Backend `tests/test_p03_correctness.py` | **5** |
| Alembic to `h8i9j0k1l2m3` | **OK** (local disposable) |

---

## 4. GO line

**CONDITIONAL GO** for production preparation (code + local evidence ready; shared migrate/deploy/backfill still require separate authorization).

**STOP.**
