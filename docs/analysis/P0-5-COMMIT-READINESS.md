# P0–5 — Controlled Commit Readiness

**Date:** 2026-11-10  
**Authorization used:** Commit preparation and read-only review only  
**Actions taken:** Inspect worktree; classify files; integrity review; write this document  
**Not performed:** staging, commit, push, deploy, migrate, backfill, destructive git  

---

## 1. Current branch and HEAD

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `31837ee577b39a07d26b73e8b11ff7ff914dc1d6` |
| HEAD subject | `Ship Pro-ready schedules, invoices, scopes, and billing lifecycle.` |
| Working tree | Dirty (21 modified tracked + many untracked) |
| Ahead/behind remote | Not required for this gate; no push planned |

Recent style: imperative, product-focused one-liners (`Ship…`, `Fix…`, `Add…`).

---

## 2. File classification (every changed path)

### 2.1 P0 indexer reliability

| Path | Notes |
|------|-------|
| `apps/indexer/src/identity.py` | New — event_key identity |
| `apps/indexer/src/integrity.py` | New — conflict detection |
| `apps/indexer/src/persistence.py` | New — idempotent writes |
| `apps/indexer/src/writer_lock.py` | New — exclusive advisory lock |
| `apps/indexer/src/scanner.py` | Cursor, END block, lock, replay |
| `apps/indexer/src/parser.py` | Dedup / identity / skip fabricated index |
| `apps/indexer/src/models.py` | event_key, IndexerCursor, asset cols |
| `apps/indexer/src/config.py` | `INDEXER_END_BLOCK`, `INDEXER_REQUIRE_EVENTS` |
| `apps/indexer/.env.example` | **Sanitized** (P0–5 security preflight): localhost placeholder `DATABASE_URL` + P0 keys `INDEXER_END_BLOCK`, `INDEXER_REQUIRE_EVENTS` |
| `apps/backend/src/models/indexer.py` | Parity with indexer models |
| `apps/backend/src/models/proposal.py` | event_key (+ later asset cols shared) |
| `apps/backend/migrations/versions/g7h8i9j0k1l2_indexer_event_keys_cursor.py` | Migration g7 |
| `deploy/alibaba/reindex-range.sh` | Cursor reset after range delete |
| `apps/indexer/pytest.ini` | Test config |
| `apps/indexer/tests/conftest.py` | Fixtures |
| `apps/indexer/tests/test_identity.py` | New |
| `apps/indexer/tests/test_replay_safety.py` | New |
| `apps/indexer/tests/test_stage_b_replay.py` | New |
| `apps/indexer/tests/test_golden_fixtures.py` | New |
| `apps/indexer/tests/fixtures/golden/*.json` | Six golden fixtures |
| `apps/indexer/tests/test_parser.py` | Updated |
| `apps/indexer/tests/test_scanner.py` | Updated |
| `apps/indexer/scripts/p02c_e2e_backfill.py` | Isolated E2E driver |
| `apps/backend/scripts/p02c_api_verify.py` | Isolated API verify |

### 2.2 P0 governance / financial correctness

| Path | Notes |
|------|-------|
| `apps/indexer/src/assets.py` | New — asset metadata |
| `apps/backend/src/money.py` | New — display / mixed-asset helpers |
| `apps/backend/migrations/versions/h8i9j0k1l2m3_treasury_asset_metadata.py` | Migration h8 |
| `apps/backend/src/schemas/stats.py` | Asset-aware stats |
| `apps/backend/src/schemas/treasury.py` | Asset fields |
| `apps/backend/src/schemas/vote.py` | Response alignment |
| `apps/backend/src/services/governance.py` | Lifecycle sort / correctness |
| `apps/backend/src/services/stats.py` | Asset-aware aggregation |
| `apps/backend/src/services/export_csv.py` | Money columns |
| `apps/backend/src/services/alert_service.py` | Display/status awareness |
| `apps/backend/src/services/report_service.py` | Same |
| `apps/frontend/app/exports/page.tsx` | Export field labels |
| `apps/indexer/tests/test_p03_correctness.py` | New |
| `apps/backend/tests/test_p03_correctness.py` | New |
| `apps/backend/tests/test_analytics.py` | Aligned with StatsService |

### 2.3 Related tests and required documentation (P0)

| Path | Notes |
|------|-------|
| `docs/analysis/P0-1-VERIFICATION-REPORT.md` | Evidence |
| `docs/analysis/P0-2-BACKFILL-READINESS.md` | Plan |
| `docs/analysis/P0-2A-*.md` | Architecture / plan |
| `docs/analysis/P0-2B-*.md` | Stage A/B evidence |
| `docs/analysis/P0-2C-*.md` | E2E evidence |
| `docs/analysis/P0-3-*.md` | Correctness evidence |
| `docs/analysis/P0-4-*.md` | Release readiness |
| `docs/analysis/P0-5-COMMIT-READINESS.md` | This document |
| `docs/analysis/p02c_artifacts/*.json` | Local E2E snapshots (localhost only) |

### 2.4 Unrelated user work — **exclude from P0 commit scope**

| Path | Notes |
|------|-------|
| `README.md` | Large SaaS/marketing rewrite; not required for P0 runtime |
| `ANALYSIS.md` | Unrelated analysis |
| `GCP_Guide.md` | Unrelated ops guide |
| `MODULES_FEATURES.md` | Product inventory; not P0 gate |
| `docs/analysis/AUDIT-AND-GRANTS-ASSESSMENT.md` | Pre-P0 assessment |
| `docs/analysis/FEATURE-GAP-MATRIX.md` | Pre-P0 |
| `docs/analysis/GOVERNANCE-INDEXER-ASSESSMENT.md` | Pre-P0 |
| `docs/analysis/TREASURY-FUND-FLOW-ASSESSMENT.md` | Pre-P0 |
| `docs/analysis/PRIORITIZED-DEVELOPMENT-ROADMAP.md` | Pre-P0 |
| `docs/analysis/PRODUCTION-READINESS-GAPS.md` | Pre-P0 |

Do **not** delete or reset these; leave unstaged.

### 2.5 Generated / transient — **exclude**

| Path | Notes |
|------|-------|
| `apps/frontend/tsconfig.tsbuildinfo` | Build artifact |
| `apps/landing/tsconfig.tsbuildinfo` | Build artifact |

### 2.6 Requires clarification / residual notes

| Path | Issue |
|------|-------|
| `apps/indexer/.env.example` | **Working-tree sanitization complete** (see `P0-5-SECURITY-PREFLIGHT.md`). Include in Commit 1. Historical git blobs at HEAD and ancestors still contain the prior Neon URL until a future commit lands — **credential rotation remains an ops requirement** (not performed here; history not rewritten). |
| Dual ORM models | Indexer vs backend models are intentionally parallel; fields for `event_key` / `IndexerCursor` / treasury assets are aligned. Accept residual drift risk (documented historically). |

---

## 3. Release integrity checks

| Check | Result |
|-------|--------|
| Secrets in **new** P0 modules/migrations/scripts/artifacts | **Pass** — localhost defaults / dummy `API_KEY=p02c-local-e2e-key`; artifacts use `localhost` / `polkaudit_p02c_e2e` |
| Secrets in working-tree `.env.example` | **Pass after sanitize** — localhost placeholder; no `npg_` / `neondb_owner` / `neon.tech` in worktree file. HEAD blob still exposed until commit. |
| P0-1 docs leak full credentials | **Pass** — host truncated (`ep-little-union-…neon.tech`); no password |
| Accidental env-specific config in code | **Pass** — START/END via settings; scripts default to disposable DB names |
| Alembic chain | **Pass** — `f6a7b8c9d0e1` → `g7h8i9j0k1l2` → `h8i9j0k1l2m3` (single head) |
| Backend/indexer model consistency | **Pass** for P0 columns (`event_key`, cursor, asset metadata) |
| Unintended deploy behavior | **Low risk** — `reindex-range.sh` cursor reset is guarded (`IF EXISTS indexer_cursor`); does not auto-run |
| Test evidence still valid | **Pass** (P0–4) — indexer 54 passed; backend 6 passed on disposable DB |
| Unrelated product features | **Excluded** — README/SaaS docs and pre-P0 assessments out of scope |

---

## 4. Proposed commit plan

Use **explicit paths** only. Do not `git add .` / `git add -A`.  
**No staging until separately authorized.**

### Commit 1 — Indexer replay safety + schema g7

| | |
|--|--|
| **Purpose** | Persist deterministic event identity, exclusive writer, contiguous cursor, and g7 migration |
| **Depends on** | HEAD `31837ee`; `.env.example` already sanitized in worktree |
| **Message** | `Harden indexer replay with event keys, writer lock, and contiguous cursor.` |
| **Evidence** | P0–2B/2C tests; indexer pytest (54); disposable g7 upgrade; `P0-5-SECURITY-PREFLIGHT.md` |

**Exact files:**

```
apps/indexer/src/identity.py
apps/indexer/src/integrity.py
apps/indexer/src/persistence.py
apps/indexer/src/writer_lock.py
apps/indexer/src/scanner.py
apps/indexer/src/parser.py
apps/indexer/src/models.py
apps/indexer/src/config.py
apps/indexer/.env.example
apps/backend/src/models/indexer.py
apps/backend/src/models/proposal.py
apps/backend/migrations/versions/g7h8i9j0k1l2_indexer_event_keys_cursor.py
deploy/alibaba/reindex-range.sh
apps/indexer/pytest.ini
apps/indexer/tests/conftest.py
apps/indexer/tests/test_identity.py
apps/indexer/tests/test_replay_safety.py
apps/indexer/tests/test_stage_b_replay.py
apps/indexer/tests/test_golden_fixtures.py
apps/indexer/tests/fixtures/golden/ref1674_confirmed.json
apps/indexer/tests/fixtures/golden/ref1674_submit_and_vote.json
apps/indexer/tests/fixtures/golden/ref1674_submit_extrinsic.json
apps/indexer/tests/fixtures/golden/ref1676_submitted.json
apps/indexer/tests/fixtures/golden/treasury_spend201_asset_approved.json
apps/indexer/tests/fixtures/golden/vote_extrinsic_poll1666.json
apps/indexer/tests/test_parser.py
apps/indexer/tests/test_scanner.py
apps/indexer/scripts/p02c_e2e_backfill.py
apps/backend/scripts/p02c_api_verify.py
```

**Note:** `proposal.py` also gains treasury asset columns used in Commit 2. Prefer including the full current `proposal.py` in Commit 1 **or** squash Commits 1–2. If splitting strictly, Commit 1 should still include the asset columns already present in the working tree (additive / nullable) so the file is not half-committed — **recommended: include full `proposal.py` in Commit 1**, then Commit 2 focuses on services/`money.py`/h8.

### Commit 2 — Governance / financial correctness + schema h8

| | |
|--|--|
| **Purpose** | Asset-aware treasury metadata and API/export/reporting correctness |
| **Depends on** | Commit 1 (g7 present; models have event_key) |
| **Message** | `Make treasury and governance money handling asset-aware and deterministic.` |
| **Evidence** | P0–3 tests; backend `test_p03_correctness` + `test_analytics`; disposable h8 upgrade |

**Exact files:**

```
apps/indexer/src/assets.py
apps/indexer/tests/test_p03_correctness.py
apps/backend/src/money.py
apps/backend/migrations/versions/h8i9j0k1l2m3_treasury_asset_metadata.py
apps/backend/src/schemas/stats.py
apps/backend/src/schemas/treasury.py
apps/backend/src/schemas/vote.py
apps/backend/src/services/governance.py
apps/backend/src/services/stats.py
apps/backend/src/services/export_csv.py
apps/backend/src/services/alert_service.py
apps/backend/src/services/report_service.py
apps/backend/tests/test_p03_correctness.py
apps/backend/tests/test_analytics.py
apps/frontend/app/exports/page.tsx
```

### Commit 3 — P0 analysis documentation

| | |
|--|--|
| **Purpose** | Preserve verification, readiness, and commit-plan evidence |
| **Depends on** | Commits 1–2 preferred (docs reference shipped behavior); may land same PR |
| **Message** | `Document P0 indexer correctness and release readiness evidence.` |
| **Evidence** | N/A (docs-only) |

**Exact files:**

```
docs/analysis/P0-1-VERIFICATION-REPORT.md
docs/analysis/P0-2-BACKFILL-READINESS.md
docs/analysis/P0-2A-DATA-CONSISTENCY-DESIGN.md
docs/analysis/P0-2A-REPLAY-CODE-REVIEW.md
docs/analysis/P0-2A-SAFE-BACKFILL-PLAN.md
docs/analysis/P0-2B-GOLDEN-EVENT-EVIDENCE.md
docs/analysis/P0-2B-IMPLEMENTATION-REPORT.md
docs/analysis/P0-2B-MIGRATION-VALIDATION.md
docs/analysis/P0-2B-STAGE-B-REPORT.md
docs/analysis/P0-2B-TEST-EVIDENCE.md
docs/analysis/P0-2C-E2E-TEST-REPORT.md
docs/analysis/P0-2C-PRODUCTION-READINESS.md
docs/analysis/P0-2C-RECONCILIATION.md
docs/analysis/P0-3-CORRECTNESS-IMPLEMENTATION.md
docs/analysis/P0-3-FINANCIAL-UNIT-VALIDATION.md
docs/analysis/P0-3-REGRESSION-RESULTS.md
docs/analysis/P0-4-CHANGE-INVENTORY.md
docs/analysis/P0-4-DEPLOYMENT-RUNBOOK.md
docs/analysis/P0-4-MIGRATION-READINESS.md
docs/analysis/P0-4-REGRESSION-EVIDENCE.md
docs/analysis/P0-4-RELEASE-DECISION.md
docs/analysis/P0-5-COMMIT-READINESS.md
docs/analysis/P0-5-SECURITY-PREFLIGHT.md
docs/analysis/p02c_artifacts/api_verify.json
docs/analysis/p02c_artifacts/interrupt_resume.json
docs/analysis/p02c_artifacts/snapshot_first.json
docs/analysis/p02c_artifacts/snapshot_second.json
```

### Optional alternate: single squashed P0 commit

If the team prefers one reviewable unit: merge Commit 1+2 (+3) with message  
`Ship P0 indexer replay safety and asset-aware governance correctness.`  
Still use the **union of exact paths** above; still exclude §2.4–2.5.

---

## 5. Excluded files (leave in worktree, do not stage)

```
README.md
ANALYSIS.md
GCP_Guide.md
MODULES_FEATURES.md
apps/frontend/tsconfig.tsbuildinfo
apps/landing/tsconfig.tsbuildinfo
docs/analysis/AUDIT-AND-GRANTS-ASSESSMENT.md
docs/analysis/FEATURE-GAP-MATRIX.md
docs/analysis/GOVERNANCE-INDEXER-ASSESSMENT.md
docs/analysis/TREASURY-FUND-FLOW-ASSESSMENT.md
docs/analysis/PRIORITIZED-DEVELOPMENT-ROADMAP.md
docs/analysis/PRODUCTION-READINESS-GAPS.md
```

---

## 6. Remaining risks

1. **Historical Neon credential exposure** — still present in git blobs at HEAD and since intro commit (see security preflight). Worktree sanitized; **rotate Neon DB password/ops credentials manually** (not done here; history not rewritten).  
2. **`proposal.py` straddles Commit 1 and 2** — include full file in Commit 1 to avoid partial commits.  
3. **Prod consistency blocker (P0–1/P0–4)** — commit does not clear deploy/migrate/backfill NO-GO.  
4. **`reindex-range.sh` is destructive when run** — shipping the script change is fine; running it is not authorized by a commit.  
5. **Unrelated dirty files** — easy to accidentally `git add` if authorization uses broad staging; stick to path lists.  
6. **Committing on `main`** — confirm whether a feature branch is preferred before authorized commit/push.

---

## 7. Final recommendation

| Decision | **CONDITIONAL GO** for commit authorization |
|----------|-----------------------------------------------|
| Meaning | P0 engineering scope is identifiable, migrations coherent, tests evidenced, `.env.example` sanitized in worktree, and a path-exact commit plan exists. |
| Blockers before GO becomes executable | (1) Explicit authorization to stage/commit; (2) confirm branch strategy (`main` vs feature branch); (3) ops acknowledgment that Neon credential rotation is required independently of the commit. |
| Still NO-GO | Push (until rotation/risk acceptance), deploy, production migrate, historical backfill (unchanged from P0–4). |

---

## 8. Stop

P0–5 commit readiness updated after security preflight.  
**Await explicit authorization** before any staging or commit. Preserve unrelated excluded files in the worktree.
