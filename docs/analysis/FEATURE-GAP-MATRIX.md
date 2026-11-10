# PolkAudit — Feature Gap Matrix

**Type:** Repository-verified assessment (analysis only)  
**Date:** 2026-11-10  
**Baseline:** [ANALYSIS.md](../../ANALYSIS.md), [MODULES_FEATURES.md](../../MODULES_FEATURES.md)  
**Method:** Code, migrations, tests, and deploy docs inspected. **No** live production DB queries, deployments, or application code changes.

### Status legend

| Status | Meaning |
|--------|---------|
| `IMPLEMENTED` | Present in code and wired end-to-end for the stated capability |
| `PARTIAL` | Exists but incomplete, incorrect in places, or missing critical edges |
| `OPS_BLOCKED` | Code ready; blocked on credentials, hosting, or operational action |
| `PROPOSED` | Not in codebase; recommended new development |
| `NEEDS_VERIFICATION` | Plausible from code; requires runtime/env confirmation |

### Defect vs hypothesis

- **Confirmed defect:** Observable mismatch or bug in repository source (e.g. UI uses wrong id, report labels planck as DOT).  
- **Hypothesis:** Explains live symptoms (e.g. empty governance KPIs) but needs DB/RPC verification.

---

## Matrix (priority pillars + ops)

| ID | Capability | Status | Priority | Complexity | Primary files | Notes |
|----|------------|--------|----------|------------|---------------|-------|
| G-01 | Finalized-block scanner + persist | IMPLEMENTED | P0 | — | `apps/indexer/src/scanner.py` | Shared Postgres with backend |
| G-02 | OpenGov proposal call extraction | PARTIAL | P0 | M | `apps/indexer/src/parser.py` | Referenda/Democracy submit set; no lifecycle upsert |
| G-03 | Conviction / Democracy vote extraction | PARTIAL | P0 | M | `parser.py` | Vote calls + `Voted` event; Democracy events whitelisted but unhandled |
| G-04 | Event whitelist vs handlers | PARTIAL | P0 | M | `parser.py` `_process_events` | Many events filtered in, few branches write rows |
| G-05 | Historical coverage / catch-up window | PARTIAL | P0 | S | `scanner.py` `_resolve_next_block` | Empty DB → last `INDEXER_CATCHUP_WINDOW` (default 2000) only |
| G-06 | In-process historical replay API | PROPOSED | P0 | L | — | Ops scripts only: `reindex-range.sh`, `demo-backfill.sh` |
| G-07 | Governance KPI API → dashboard | IMPLEMENTED | P0 | — | `stats.py`, `apps/frontend/app/page.tsx` | Counts raw table rows |
| G-08 | Proposal detail navigation | PARTIAL | P1 | S | `proposals/page.tsx` | **Confirmed defect:** href uses DB `id`, API expects `proposal_index` |
| G-09 | OpenGov lifecycle intelligence (tracks, periods, deposits) | PROPOSED | P0 | L | — | Product pillar; not modeled beyond submit/status events |
| T-01 | Treasury spend call/event parse | PARTIAL | P0 | M | `parser.py` | Calls + Awarded/SpendApproved; possible dual-path duplicates |
| T-02 | Persist `treasury_spends` | IMPLEMENTED | P0 | — | indexer models + backend model | |
| T-03 | List API + CSV (`value_planck`) | IMPLEMENTED | P0 | — | `treasury.py`, `export_csv.py` | |
| T-04 | Frontend DOT display | PARTIAL | P0 | S | `apps/frontend/app/treasury/page.tsx` | Frontend converts; overview KPI still planck string |
| T-05 | Date/block filters on treasury UI | PROPOSED | P0 | S | treasury page “Coming soon” | |
| T-06 | Referendum → spend linkage | PROPOSED | P0 | L | schema has no FK/ref index on spends | |
| T-07 | Unit consistency (reports/alerts) | PARTIAL | P0 | M | `report_service.py`, `alert_service.py` | **Confirmed defect:** planck labeled as DOT |
| T-08 | Populated live treasury rows | NEEDS_VERIFICATION / OPS_BLOCKED | P0 | — | catch-up + RPC | Depends on scanned range containing spends |
| A-01 | Audit cases CRUD + comments | IMPLEMENTED | P1 | — | `audit/*`, console `/audit` | Project-scoped |
| A-02 | Evidence integrity (content hash / storage) | PARTIAL | P1 | L | `audit/service.py` | Hashes URL+description, not file bytes |
| A-03 | Compliance engine | PARTIAL | P1 | M | `compliance/service.py` | Manual event ingest; UI rule type mismatch risk |
| A-04 | Governance PDF reports | PARTIAL | P1 | M | `report_service.py` | Period filter stub; unit bug; `/tmp` storage |
| A-05 | Grants & milestones | PROPOSED | P1 | L | — | Marketing/docs only; no models |
| O-01 | Console deploy path (SAS) | IMPLEMENTED | P0 | — | GH Actions, nginx, systemd | |
| O-02 | Console live availability | NEEDS_VERIFICATION | P0 | S | ANALYSIS.md report | Ops probe required |
| O-03 | Landing privacy claim accuracy | PARTIAL | P0 | S | `security.tsx` vs `User` model | **Confirmed defect** in copy |
| O-04 | Privacy/Terms dedicated pages | PARTIAL | P0 | S | landing footer → GitHub docs | |
| O-05 | Razorpay checkout + webhook code | IMPLEMENTED | P0 | — | `razorpay_service.py`, billing API | |
| O-06 | Razorpay/SMTP live secrets | OPS_BLOCKED | P0 | S | `backend.env` | |
| O-07 | Indexer metrics/health | IMPLEMENTED | P0 | — | indexer `server.py` | Localhost; no scrape/alerts in repo |
| O-08 | DLQ operator visibility | PARTIAL | P0 | M | scanner DLQ insert | No admin UI |
| O-09 | Workspace tenant isolation | IMPLEMENTED | P1 | — | JWT + memberships | Keys/alerts/billing |
| O-10 | Chain-data tenant isolation | PARTIAL | P1 | — | by design shared index | Document honestly |
| O-11 | Admin DB explorer | IMPLEMENTED | P0 | — | `admin_db.py` | App RO; DB role may be full |
| O-12 | Analytics / scoring / AI scaffolds | PARTIAL | P2–P3 | — | Mock LLM; heuristic scores | Do not rebuild SaaS |

---

## Cross-cutting confirmed defects (code)

1. **Proposal list → detail:** `/proposals/${proposal.id}` vs API `/proposals/{proposal_index}` — `apps/frontend/app/proposals/page.tsx`.  
2. **Planck labeled DOT:** `report_service.py`, `alert_service.py`.  
3. **Privacy marketing:** landing claims no private user data; `users.email` + billing payloads exist.  
4. **Unhandled governance events:** whitelist includes Democracy lifecycle events without persistence handlers.

---

## Cross-cutting hypotheses (need runtime)

1. Live zero proposals/votes/treasury because catch-up window / start block excludes governance-dense history.  
2. Indexer and API `DATABASE_URL` mismatch (unlikely if same Neon, but unguarded).  
3. Event JSON shape from production RPC skips handlers (`module_id` / `event_id` aliases).  
4. Console upstream error during ANALYSIS inspection was transient deploy/nginx/cert — not architectural.

---

## Document map

| Deliverable | Path |
|-------------|------|
| This matrix | [FEATURE-GAP-MATRIX.md](./FEATURE-GAP-MATRIX.md) |
| Governance indexer | [GOVERNANCE-INDEXER-ASSESSMENT.md](./GOVERNANCE-INDEXER-ASSESSMENT.md) |
| Treasury fund flow | [TREASURY-FUND-FLOW-ASSESSMENT.md](./TREASURY-FUND-FLOW-ASSESSMENT.md) |
| Audit & grants | [AUDIT-AND-GRANTS-ASSESSMENT.md](./AUDIT-AND-GRANTS-ASSESSMENT.md) |
| Production readiness | [PRODUCTION-READINESS-GAPS.md](./PRODUCTION-READINESS-GAPS.md) |
| Roadmap | [PRIORITIZED-DEVELOPMENT-ROADMAP.md](./PRIORITIZED-DEVELOPMENT-ROADMAP.md) |

**Stop:** No feature development until authorized.
