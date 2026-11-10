# P0–2A — Data Consistency Design (Code-Level)

**Scope:** Local source review only — how counts and configuration can diverge **without** inspecting live systems.  
**Date:** 2026-11-10

---

## 1. Purpose

Explain, from repository code alone, how dashboard/API statistics are produced and which implementation choices can yield **inconsistent or misleading counts** (blocks vs governance, indexer vs API, cursor vs `blocks` table).

---

## 2. How statistics are calculated

### 2.1 API path (source of truth for dashboard KPIs)

| Layer | Location | Behavior |
|-------|----------|----------|
| Route | `GET /api/v1/stats/overview` (API router) | Authenticated; returns `StatsOverview` |
| Service | `StatsService.get_overview` — `apps/backend/src/services/stats.py` | Independent SQL aggregates |
| Frontend | `apps/frontend/lib/api.ts` `getStats` → Overview cards in `apps/frontend/app/page.tsx` | Displays API fields as-is |

### 2.2 Aggregate definitions (confirmed)

| Field | SQL semantics in `get_overview` |
|-------|----------------------------------|
| `total_proposals` | `COUNT(proposals.id)` |
| `total_votes` | `COUNT(votes.id)` |
| `total_treasury_spend` | `SUM(CAST(treasury_spends.value AS numeric))` as string — **sum of planck**, not spend count |
| `total_blocks_indexed` | `COUNT(blocks.id)` |
| `total_extrinsics` | `COUNT(extrinsics.id)` |
| `last_indexed_block` | `MAX(processed_blocks.block_number)` |
| `last_governance_block` | `MAX` across proposal/vote/spend `block_number` |
| `governance_lag_blocks` | `last_indexed - last_gov` if any governance; else `last_indexed` |

**Confirmed:** Overview is **global** (no `project_id` filter). Multi-tenant project columns exist on models but indexer writes leave them null; stats ignore them.

### 2.3 Related but different count surfaces

| Surface | Code | Difference vs overview |
|---------|------|------------------------|
| Governance list APIs | `GovernanceService` — `apps/backend/src/services/governance.py` | Lists by `proposal_index`; detail expects that index |
| Activity feed | `apps/backend/src/services/activity.py` | Recent proposals/votes/spends by `block_number` |
| Local scripts | `scripts/_governance_db.py` `fetch_counts` | Same table COUNTs + `MAX(processed_blocks)`; **no** treasury SUM |
| Indexer logs | `Found governance` only when parse counts &gt; 0 | Not a dashboard source |

---

## 3. Indexed block and extrinsic counts

| Metric | Table / field | Writer |
|--------|---------------|--------|
| Block rows | `blocks` — one row per successfully processed height | `FinalizedScanner.process_block` |
| Extrinsic rows | `extrinsics` — one per **successfully decoded** extrinsic in parse | `ChainParser._process_decoded_extrinsic` |
| Cursor | `processed_blocks` | Same commit as block row |
| Header extrinsic count | `blocks.extrinsics_count` | Length of raw RPC extrinsic list (may exceed decoded rows) |

**Code-level inconsistency possibilities:**

1. **`COUNT(blocks)` ≠ cursor span length** if gaps exist (start jump) or partial deletes left orphaned rows.
2. **`COUNT(extrinsics)` ≠ `SUM(blocks.extrinsics_count)`** when decode fails for some hex payloads (`parse_block` catches per-extrinsic and skips).
3. **`last_indexed_block` (MAX processed) ≠ `COUNT(blocks)`** when range is sparse (e.g. start at 32.8M after jump) — lag math still uses MAX, not density.
4. **Treasury KPI label vs value:** UI may present `total_treasury_spend` as money while it is a **raw planck sum** (unit labeling defects documented elsewhere).

---

## 4. How indexer / API database configuration is selected

| Component | Config entry | Loader |
|-----------|--------------|--------|
| Indexer | `DATABASE_URL` required | `apps/indexer/src/config.py` → `async_database_url` → `create_async_engine` in `database.py` |
| Backend API | `DATABASE_URL` required | `apps/backend/src/config.py` → same normalize helper → `apps/backend/src/database.py` |
| Demo scripts | Prefer indexer `.env`, then backend `.env` via `setdefault` | `scripts/_governance_db.py` `load_indexer_env` |
| Deploy reindex | Sources `/etc/polkaudit/indexer.env` | `deploy/alibaba/reindex-range.sh` |

**Confirmed code fact:** Nothing in process code **cross-checks** that indexer and API URLs point at the same database. Consistency is an **ops/env** invariant.

**Code-level reasons for “API shows X / DB script shows Y” without live debug:**

| Cause | Mechanism |
|-------|-----------|
| Different `DATABASE_URL` per service | Separate Settings objects; no shared config package at runtime |
| Script loads indexer `.env` first | `setdefault` means indexer wins if both define `DATABASE_URL` |
| API auth / wrong environment | Frontend hits prod API while scripts hit local Neon (or reverse) |
| Caching | Not present in `StatsService` today — less likely for count drift |
| Dual schema definitions | Indexer vs backend ORM copies of same tables; migrations owned by backend — drift risk if models diverge |

**Assumption (not verified in this task):** production env files currently match. Prior P0–1 noted same Neon host in local envs; that is outside this local-only gate.

---

## 5. Code-level reasons governance counts stay zero while blocks &gt; 0

These are **implementation explanations**, not live diagnoses:

| # | Mechanism | Code evidence |
|---|-----------|---------------|
| C1 | Indexed height range contains no matched calls/events | Whitelist in `parser.py`; scanner still commits empty governance |
| C2 | Events failed to fetch → `[]`, extrinsic path also misses | `_fetch_events_sync` swallows errors |
| C3 | Catch-up / start jump skipped eras with activity | `_resolve_next_block` |
| C4 | Cursor stalled (process not running) while DB retains old blocks | Scanner loop only advances while alive |
| C5 | Parser builds proposals with wrong `proposal_index` but still non-zero | Fallback to extrinsic index — would **not** keep counts at zero |
| C6 | Reads hit a different DB than the indexer wrote | Separate `DATABASE_URL`s |

Zeros with non-zero blocks are therefore **expected** under C1–C4 even when the pipeline is “healthy.”

---

## 6. Consistency invariants to enforce (design targets)

Proposed checks for future local/CI and pre-backfill gates (no implementation in this task):

| ID | Invariant | Pass condition |
|----|-----------|----------------|
| I1 | Cursor ↔ blocks | Every `processed_blocks.block_number` has a `blocks` row and vice versa in claimed range |
| I2 | Extrinsic density | `COUNT(extrinsics)` ≤ `SUM(blocks.extrinsics_count)` |
| I3 | No orphan governance | Every proposal/vote/spend `block_number` ∈ `blocks` |
| I4 | Dedup | Zero duplicate logical keys once uniqueness is defined (see safe plan) |
| I5 | Config parity | Indexer and API `DATABASE_URL` host+db name equal (fingerprint only) |
| I6 | Stats reconciliation | Script COUNTs == `/stats/overview` counterparts (treasury: document SUM vs COUNT) |
| I7 | Lag semantics | Document that `governance_lag_blocks == last_indexed` when governance empty is **by design**, not “indexer lag” alone |

---

## 7. Confirmed vs assumption

| Item | Class |
|------|-------|
| Stats formulas and global scope | Confirmed |
| No cross-service DB binding check | Confirmed |
| Block unique vs governance non-unique | Confirmed |
| Frontend mirrors API overview fields | Confirmed |
| Whether prod API and indexer share one DB today | Assumption / ops |
| Whether dashboard users misread planck SUM as DOT | Assumption about UX; code stores/returns numeric string sum |

---

## 8. References

- Replay behavior: [P0-2A-REPLAY-CODE-REVIEW.md](./P0-2A-REPLAY-CODE-REVIEW.md)
- Remediation plan: [P0-2A-SAFE-BACKFILL-PLAN.md](./P0-2A-SAFE-BACKFILL-PLAN.md)
- Prior live read-only evidence (separate gate): [P0-1-VERIFICATION-REPORT.md](./P0-1-VERIFICATION-REPORT.md)

**STOP for P0–2A Task 2.**
