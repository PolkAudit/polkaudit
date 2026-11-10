# P0 — Governance Indexing & Historical Backfill Assessment

**Status classifications:** `IMPLEMENTED | PARTIAL | OPS_BLOCKED | PROPOSED | NEEDS_VERIFICATION`  
**Scope:** Repository verification only (2026-11-10).

---

## 1. Executive finding

The **indexing pipeline is implemented** (scanner → parser → PostgreSQL → `/api/v1/stats/overview` + `/proposals`). Live **zero proposals / votes** is **not** proof the parser is broken. The most code-supported explanations are:

1. **Confirmed limitation:** empty DB starts at `finalized_head - INDEXER_CATCHUP_WINDOW` (default **2000** blocks) unless `INDEXER_START_BLOCK` is set.  
2. **Confirmed limitation:** most blocks contain no matched governance extrinsics.  
3. **Confirmed gaps:** many `GOVERNANCE_EVENTS` are whitelisted but never persisted; no upsert/lifecycle model; no in-app historical replay (ops scripts only).  
4. **Confirmed frontend defect:** proposal links use DB `id` instead of `proposal_index` (breaks detail when rows exist).

**Hypothesis (needs DB verification):** production cursor never entered a governance-dense historical range.

---

## 2. Pipeline map (evidence)

| Layer | Path | Key symbols |
|-------|------|-------------|
| Entry | `apps/indexer/src/main.py` | `main()`, DB verify, scanner task |
| Config | `apps/indexer/src/config.py` | `INDEXER_START_BLOCK`, `INDEXER_CATCHUP_WINDOW` |
| Scanner | `apps/indexer/src/scanner.py` | `FinalizedScanner`, `_resolve_next_block`, `process_block` |
| Parser | `apps/indexer/src/parser.py` | `ChainParser`, call/event sets, `_classify_call`, `_process_events` |
| Models | `apps/indexer/src/models.py` | `Proposal`, `Vote`, `ProcessedBlock`, `DeadLetterQueue` |
| Metrics | `apps/indexer/src/server.py` | `/health`, `/metrics` |
| Tests | `apps/indexer/tests/test_parser.py`, `test_scanner.py` | Mocked decode / mocked process_block |
| API | `apps/backend/src/services/stats.py`, `governance.py`, `api/v1/router.py` | KPI counts, list/detail |
| UI | `apps/frontend/app/page.tsx`, `proposals/page.tsx`, `proposals/[id]/page.tsx` | Overview + list/detail |
| Ops backfill | `deploy/alibaba/reindex-range.sh`, `scripts/demo-backfill.sh`, `scripts/check-governance-data.sh` | Truncate/re-scan helpers |

Schema ownership: backend Alembic (`b1c2d3e4f5a6_add_core_governance_tables.py` and follow-ons). Indexer expects migrations already applied.

---

## 3. Supported match sets (confirmed from `parser.py`)

### Proposal calls

`(Democracy, propose|second)`, `(Referenda, submit|submit_unsigned|place_decision_deposit|decide)`.

### Vote calls

`(Democracy, vote)`, `(ConvictionVoting, vote|remove_vote|delegate)`.

### Events whitelisted

Referenda Submitted/DecisionStarted/Confirmed/Approved/Rejected/TimedOut/Cancelled; Democracy Proposed/Started/Passed/NotPassed; ConvictionVoting Voted; Treasury SpendApproved/Awarded/Proposed.

### Events that actually write governance rows (confirmed)

Handlers persist from: `Referenda.Submitted`, `ConvictionVoting.Voted`, Referenda outcome events (Confirmed/Approved/Rejected/TimedOut/Cancelled), plus treasury Awarded/SpendApproved (treasury assessment).

**Confirmed gap:** Democracy events and `DecisionStarted` (and similar) pass the whitelist filter but have **no** persistence branch → silent no-op.

### Wrappers unwrapped

Utility batch variants, Proxy, Multisig — leaf calls reclassified.

---

## 4. Catch-up / backfill behavior (confirmed)

| Condition | Next height |
|-----------|-------------|
| `INDEXER_START_BLOCK > 0` and cursor behind start | Jump to start (skip forward) |
| Empty DB (`last_processed == 0`) and start unset | `head - INDEXER_CATCHUP_WINDOW` |
| Otherwise | `last_processed + 1` |

**No** in-process rewind. Re-scan requires deleting `processed_blocks` / related rows and restarting with start height (see `reindex-range.sh`).

Failed blocks → `dead_letter_queue`; same height retried (no skip threshold) — **PARTIAL** recovery.

---

## 5. Gap catalog

### G-05 — Historical coverage window

| Field | Content |
|-------|---------|
| **Capability** | Index enough history to show real OpenGov activity |
| **Status** | `PARTIAL` |
| **Files** | `scanner.py` `_resolve_next_block`, `config.py` |
| **Evidence** | Default catch-up is 2000 blocks on empty DB |
| **Missing** | Documented/prod default start at known governance era; automated multi-window backfill |
| **Approach** | Ops: set `INDEXER_START_BLOCK` to verified historical height; or raise window + run `reindex-range.sh` for known refs |
| **Dependencies** | RPC rate limits; disk; downtime window |
| **Priority** | P0 |
| **Acceptance** | Against same DB as API: `COUNT(*) FROM proposals/votes > 0` for a known historical referendum range OR documented empty-range explanation |
| **Tests** | Unit tests for `_resolve_next_block` matrix; ops checklist using `check-governance-data.sh` |
| **Complexity** | S (ops) / M (if automation CLI) |
| **Type** | Limitation (confirmed) + ops hypothesis for live zeros |

### G-04 — Event whitelist without handlers

| Field | Content |
|-------|---------|
| **Capability** | Persist all whitelisted governance events |
| **Status** | `PARTIAL` |
| **Files** | `parser.py` `GOVERNANCE_EVENTS`, `_process_events` |
| **Evidence** | Filter admits Democracy/DecisionStarted; no `elif` writes for several keys |
| **Missing** | Handlers or trimmed whitelist |
| **Approach** | Add handlers with fixtures from real blocks; or remove unused whitelist entries to avoid false confidence |
| **Dependencies** | Golden event JSON from production RPC |
| **Priority** | P0 |
| **Acceptance** | Fixture block with Democracy.Proposed / Referenda.DecisionStarted yields expected rows |
| **Tests** | Parametrized `test_parser` event matrix |
| **Complexity** | M |
| **Type** | Confirmed defect (incomplete implementation) |

### G-02 — Proposal lifecycle / upsert

| Field | Content |
|-------|---------|
| **Capability** | One coherent referendum record across submit → decide → outcome |
| **Status** | `PARTIAL` / product `PROPOSED` for full lifecycle |
| **Files** | `parser.py` `_build_proposal`; `governance.py` `.first()` on index |
| **Evidence** | Append-only inserts; multiple rows per index possible |
| **Missing** | Upsert by `proposal_index`; tracks, deposits, periods |
| **Approach** | Phase A: upsert status transitions; Phase B: lifecycle tables (ANALYSIS pillar) |
| **Dependencies** | Schema migration; product field list |
| **Priority** | P0 (product) / P1 (upsert hygiene) |
| **Acceptance** | Detail API returns current status for a ref with submit+outcome in DB |
| **Tests** | Multi-event fixture for same `proposal_index` |
| **Complexity** | M–L |
| **Type** | Confirmed gap |

### G-06 — Replay / reconciliation

| Field | Content |
|-------|---------|
| **Capability** | Reindex range + reconcile vs external source |
| **Status** | `PROPOSED` (API) / `OPS_BLOCKED` until runbooks executed |
| **Files** | `deploy/alibaba/reindex-range.sh`, `scripts/demo-backfill.sh` |
| **Evidence** | Shell-only; no admin replay endpoint; no Subscan reconciliation job |
| **Missing** | Safe CLI/API; hash/count checks |
| **Approach** | Formalize runbook first; later admin-gated reindex job |
| **Dependencies** | Auth; DB locks; RPC |
| **Priority** | P0 (ops execution) / P2 (API) |
| **Acceptance** | Documented reindex of range X..Y produces expected proposal_index set |
| **Tests** | Dry-run script against fixture DB |
| **Complexity** | S ops / L productized |
| **Type** | Confirmed absence of productized replay |

### G-08 — Frontend proposal id mismatch

| Field | Content |
|-------|---------|
| **Capability** | Open proposal detail from list |
| **Status** | `PARTIAL` |
| **Files** | `apps/frontend/app/proposals/page.tsx` L164; `router.py` `/{proposal_index}` |
| **Evidence** | Navigation uses `proposal.id`; API keys on `proposal_index` |
| **Missing** | Correct href |
| **Approach** | Use `proposal.proposal_index` in link (minimal fix; preserve architecture) |
| **Dependencies** | None |
| **Priority** | P1 (P0 if demoing existing rows) |
| **Acceptance** | Click list row → 200 detail for that referendum index |
| **Tests** | Frontend/e2e smoke |
| **Complexity** | S |
| **Type** | Confirmed defect |

### G-03 / vote completeness

| Field | Content |
|-------|---------|
| **Capability** | Index conviction votes & delegations |
| **Status** | `PARTIAL` |
| **Files** | `GOVERNANCE_VOTE_CALLS`, event `Voted` |
| **Evidence** | Calls + Voted event supported; Fellowship/whitelist pallets absent |
| **Missing** | Broader OpenGov vote surfaces if required by product |
| **Approach** | Inventory live call stats; extend match sets with fixtures |
| **Priority** | P1 |
| **Acceptance** | Known vote extrinsic in fixture → `votes` row |
| **Tests** | Parser fixtures |
| **Complexity** | M |
| **Type** | Confirmed partial coverage |

### G-01 pipeline health

| Field | Content |
|-------|---------|
| **Capability** | Continuous finalized indexing |
| **Status** | `IMPLEMENTED` |
| **Evidence** | Scanner loop, metrics, DLQ, shared schema |
| **Missing** | External alerting (see production doc) |
| **Priority** | P0 ops monitoring |
| **Complexity** | — |

---

## 6. Why dashboard shows zeros (structured)

| Cause | Classification | Action |
|-------|----------------|--------|
| Catch-up window too short / start block too recent | Confirmed limitation + **hypothesis** for prod | Verify `MAX(block_number)`, counts via `check-governance-data.sh` |
| No matched extrinsics in scanned range | Confirmed normal behavior | Backfill known OpenGov heights |
| Parser broken for all OpenGov | **Not supported** by unit tests (`test_parser` covers Referenda/Democracy/Conviction) | Do not rebuild indexer |
| Stats API disconnected | Unlikely — same models | Confirm shared `DATABASE_URL` |
| UI filter hides Active-only | Confirmed for **list filters**, not overview totals | Separate from KPI zeros |

---

## 7. Test assessment

| Area | Present | Gap |
|------|---------|-----|
| Parser unit (mocked scale decode) | Yes | Real RPC event shapes |
| Scanner process_block mock | Yes | `_resolve_next_block` untested; assert may be stale vs 3-arg parse |
| E2E indexer→API | Script helpers | Not CI-enforced golden referendum |
| Frontend navigation | None found | id vs index regression |

---

## 8. Recommended technical sequence (governance only)

1. **Verify** prod DB counts + cursor (ops; `NEEDS_VERIFICATION`).  
2. **Backfill** known OpenGov range via existing scripts (`OPS_BLOCKED` until executed).  
3. **Fix** event handler coverage + proposal upsert hygiene (`PARTIAL`).  
4. **Fix** frontend `proposal_index` link (`PARTIAL` defect).  
5. **Only then** design full Governance Lifecycle Intelligence tables (`PROPOSED`).

**Do not** replace the scanner/parser architecture without evidence of systemic decode failure.
