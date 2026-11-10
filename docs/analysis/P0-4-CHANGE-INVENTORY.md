# P0–4 — Change Inventory (P0–2B → P0–3)

**Date:** 2026-11-10  
**Basis:** `git status` / `git diff` against `HEAD` (`31837ee`)  
**No commit/push performed**

---

## 1. Scope classification

| Bucket | Include in P0 release candidate? |
|--------|----------------------------------|
| Indexer replay safety, identity, assets, scanner/cursor/lock | **Yes** |
| Backend governance/money/stats/export/alert/report + migrations | **Yes** |
| Frontend export field labels | **Yes** (tiny compat) |
| `deploy/alibaba/reindex-range.sh` cursor reset | **Yes** |
| Indexer/backend tests + golden fixtures + local scripts | **Yes** |
| `docs/analysis/P0-*` + readiness docs | **Yes** (docs) |
| Earlier gap assessments under `docs/analysis/` | Optional docs |
| `README.md` rewrite (SaaS marketing/status from earlier work) | **Separate** — predates/alongside P0; review before bundling |
| `ANALYSIS.md`, `GCP_Guide.md`, `MODULES_FEATURES.md` | **Exclude** from code release (docs-only, unrelated to P0 runtime) |
| `*.tsbuildinfo` | **Exclude** (build artifacts) |

---

## 2. Modified tracked files (P0-relevant)

| Path | Gate |
|------|------|
| `apps/indexer/src/scanner.py` | 2B/2C |
| `apps/indexer/src/parser.py` | 2B/2C/3 |
| `apps/indexer/src/models.py` | 2B/3 |
| `apps/indexer/src/config.py` | 2B |
| `apps/indexer/.env.example` | 2B |
| `apps/indexer/tests/test_parser.py` | 2B/3 |
| `apps/indexer/tests/test_scanner.py` | 2B |
| `apps/backend/src/models/indexer.py` | 2B |
| `apps/backend/src/models/proposal.py` | 2B/3 |
| `apps/backend/src/schemas/{stats,treasury,vote}.py` | 3 |
| `apps/backend/src/services/{governance,stats,export_csv,alert_service,report_service}.py` | 3 |
| `apps/frontend/app/exports/page.tsx` | 3 |
| `deploy/alibaba/reindex-range.sh` | 2B |
| `apps/backend/tests/test_analytics.py` | 4 (aligned with StatsService) |

`README.md` — modified but **not** required for P0 runtime correctness.

---

## 3. New untracked modules (P0-relevant)

| Path | Role |
|------|------|
| `apps/indexer/src/{identity,integrity,persistence,writer_lock,assets}.py` | Replay identity/idempotency/lock/assets |
| `apps/indexer/pytest.ini`, `tests/conftest.py`, `tests/fixtures/golden/*` | Local tests |
| `apps/indexer/tests/test_{identity,replay_safety,stage_b_replay,golden_fixtures,p03_correctness}.py` | Regression |
| `apps/indexer/scripts/p02c_e2e_backfill.py` | Isolated E2E driver |
| `apps/backend/src/money.py` | Asset-aware money helpers |
| `apps/backend/migrations/versions/g7h8i9j0k1l2_*.py` | event_key + cursor |
| `apps/backend/migrations/versions/h8i9j0k1l2m3_*.py` | treasury asset metadata |
| `apps/backend/tests/test_p03_correctness.py` | Backend P0-3 tests |
| `apps/backend/scripts/p02c_api_verify.py` | Local API service verify |
| `docs/analysis/P0-*.md`, `docs/analysis/p02c_artifacts/*` | Evidence |

---

## 4. Configuration / deploy script changes

| Item | Change |
|------|--------|
| `INDEXER_END_BLOCK`, `INDEXER_REQUIRE_EVENTS` | New indexer settings |
| Advisory/`WriterLock` | Runtime exclusive writer |
| `reindex-range.sh` | Resets `indexer_cursor` on range clear |

No production credential files modified in this inventory.

---

## 5. Unrelated / do-not-ship with P0 code commit (recommended split)

- `ANALYSIS.md`, `GCP_Guide.md`, `MODULES_FEATURES.md`  
- `apps/frontend/tsconfig.tsbuildinfo`, `apps/landing/tsconfig.tsbuildinfo`  
- Optionally defer `README.md` to a docs PR  

---

## 6. Diff scale (approx)

~20 tracked files changed (+1208 / −603 lines) plus new modules/migrations/tests/docs as above.
