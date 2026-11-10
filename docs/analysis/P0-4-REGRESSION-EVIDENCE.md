# P0–4 — Regression Evidence

**Date:** 2026-11-10  
**Environment:** local disposable only  

---

## 1. Passing

| Suite | Command / scope | Result |
|-------|-----------------|--------|
| Indexer unit/integration | `cd apps/indexer && python3 -m pytest -q` | **54 passed** (~1.8s) |
| Backend P0–3 + analytics | `DATABASE_URL=…/polkaudit_p04_reg` → `pytest tests/test_p03_correctness.py tests/test_analytics.py` | **6 passed** |

Indexer coverage: identity, integrity, writer lock, scanner/cursor, Stage B replay, golden fixtures, P0–3 correctness, parser/scanner baselines.

Backend coverage: money/asset display, lifecycle sort, CSV money columns, mixed-asset refusal, stats aggregation with asset-aware mocks.

---

## 2. Failing

None on clean disposable DBs.

**Environment note (not a product fail):** On a polluted `polkaudit_p03_test` schema, `Base.metadata.drop_all` errored with `DependentObjectsStillExistError` (FK dependents on `projects`). Re-run on fresh `polkaudit_p04_reg` → 6/6 pass. Document as harness fragility; do not treat as P0 logic regression.

---

## 3. Skipped / not run

| Area | Status | Notes |
|------|--------|-------|
| Full backend suite (all `tests/`) | **Not fully run** | Scoped to P0-relevant + analytics |
| Frontend e2e / Playwright | **Not run** | Export page label change only |
| Live AuthN/AuthZ HTTP | **Not run** | Needs local stack + tokens |
| Tenant isolation HTTP | **Not run** | Same |
| Billing / Console live | **Not run** | Out of P0 scope |
| Production DB consistency | **Blocked** | Needs authorized prod access (§5) |
| Live archive RPC backfill | **Not executed** (by design) | Prior P0–2C isolated E2E only |

---

## 4. Unavailable

- Production API stats comparison (historically **403** without auth).  
- Shared Neon / Alibaba production writers.  
- CI on this uncommitted tree (no push).

---

## 5. Production consistency blocker (carry-forward)

P0–1 observed **different block/extrinsic counts** between live dashboard views and the DB inspected during verification.

Repository/deploy evidence that **can** explain discrepancy (unproven in prod until authorized check):

| Factor | Evidence |
|--------|----------|
| Shared Neon `DATABASE_URL` for local+services | P0–1; dual-writer / stale cursor risk |
| Stale `indexer_cursor` / incomplete coverage | Cursor ~32.80M; `INDEXER_START_BLOCK=31370000` does not rewind |
| Empty/narrow governance tables vs dashboard layer | Dashboard may not equal raw table counts |
| Pre-g7 identity / dual-path duplicates | Mitigated in code; prod state unknown |

**Safe checks requiring explicit authorization (read-only preferred):**

1. Confirm DB URL binding for indexer, API, dashboard.  
2. Read-only `COUNT(*)` on `blocks`, `extrinsics`, `processed_blocks`, `indexer_cursor`, governance tables.  
3. Authenticated API stats read (no writes).  
4. Confirm single-writer / WriterLock topology.  
5. No cursor reset or reindex until authorized runbook step.

---

## 6. Verdict on regression gate

**Local engineering regression: PASS** for scoped P0 suites on disposable DBs.  
**Production parity verification: OPEN** — blocks unconditional deploy GO.
