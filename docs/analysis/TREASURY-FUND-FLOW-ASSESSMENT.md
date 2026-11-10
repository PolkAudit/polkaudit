# P0 — Treasury Fund Flow & Financial Accuracy Assessment

**Status classifications:** `IMPLEMENTED | PARTIAL | OPS_BLOCKED | PROPOSED | NEEDS_VERIFICATION`  
**Scope:** Repository verification only (2026-11-10).

---

## 1. Executive finding

Treasury **extraction and persistence are implemented** for a defined set of calls/events. What is **not** implemented is true **fund-flow reconciliation** (referendum → approved spend → payment → beneficiary trail). Financial **unit handling is inconsistent**: storage and CSV use **planck**; several UI/report/alert paths label values as **DOT** without conversion — **confirmed defects**.

Empty live treasury KPIs are most consistent with **indexing window / sparse matching** (same as governance), not missing `Treasury.spend` parsing.

---

## 2. Current implementation map

| Layer | Path | Behavior |
|-------|------|----------|
| Parse calls | `apps/indexer/src/parser.py` `TREASURY_SPEND_CALLS` | `Treasury.spend|spend_local|propose_spend|approve_proposal|payout`, `Spender.spend|spend_local` |
| Parse events | same `_process_events` | `Treasury.Awarded`, `Treasury.SpendApproved` append spends |
| Persist | `scanner.py` | `session.add_all(... treasury_spends)` |
| Model | `apps/backend/src/models/proposal.py` `TreasurySpend` | `block_number`, `beneficiary`, `value` (string), optional `project_id` |
| API | `GET /api/v1/treasury/spends` | skip/limit list via `TreasuryService` |
| Export | `export_csv.py` / `GET .../export/treasury/csv` | Header **`value_planck`** (correct labeling) |
| Schedules | `schedule_runner.py` | Reuses CSV builder |
| Frontend | `apps/frontend/app/treasury/page.tsx` | Divides by `10_000_000_000`; date filter **disabled** |
| Overview | `stats.py` + home page | Sum of spend strings; UI notes planck on frontend home |
| Reports | `report_service.py` | Sums values, prints **“… DOT”** |
| Alerts | `alert_service.py` | Message says **“{value} DOT”** |
| Scoring | `scoring_service.py` | String compare on `value` |

Unit test: `apps/indexer/tests/test_parser.py` `test_treasury_spend` expects planck string `"1000000000000"`.

---

## 3. Gap catalog

### T-01 — Extraction completeness & dedup

| Field | Content |
|-------|---------|
| **Capability** | Capture treasury payouts without duplicates |
| **Status** | `PARTIAL` |
| **Files** | `parser.py` call set + event branches |
| **Evidence** | Extrinsic path and event path both append; no merge key. `approve_proposal` often skipped (no amount). |
| **Missing** | Dedup `(block, beneficiary, value, event_index)`; Asset Hub / multi-asset; richer OpenGov spender metadata |
| **Approach** | Prefer event-sourced payouts when present; mark extrinsic duplicates; research live pallet usage before expanding match sets |
| **Dependencies** | Golden blocks from Polkadot |
| **Priority** | P0 |
| **Acceptance** | Known Awarded event → exactly one `treasury_spends` row |
| **Tests** | Parser fixtures for Awarded + spend extrinsic in same block |
| **Complexity** | M |
| **Type** | Confirmed gap (dedup); hypothesis on live pallet coverage |

### T-06 — Referendum → payment linkage

| Field | Content |
|-------|---------|
| **Capability** | Trace funding decision to on-chain payment |
| **Status** | `PROPOSED` |
| **Files** | `TreasurySpend` schema; parser builders |
| **Evidence** | No `referendum_index`, `proposal_id`, or `extrinsic_hash` columns on spends |
| **Missing** | Schema + parser enrichment from SpendApproved / referenda confirmation |
| **Approach** | Migration adding `referendum_index`, `extrinsic_hash`, `event_index`; populate when attrs exist; UI link to `/proposals/{index}` |
| **Dependencies** | Governance proposal index integrity (G-02) |
| **Priority** | P0 (ANALYSIS fund-flow pillar) |
| **Acceptance** | For fixture block, spend row links to correct `proposal_index` when chain provides it |
| **Tests** | Integration fixture Confirm+Awarded |
| **Complexity** | L |
| **Type** | Confirmed absence |

### T-07 — Planck / DOT consistency

| Field | Content |
|-------|---------|
| **Capability** | Accurate financial presentation |
| **Status** | `PARTIAL` |
| **Files** | `report_service.py` L70; `alert_service.py` L76; treasury page vs overview |
| **Evidence** | CSV correctly says `value_planck`; report/alert label DOT without ÷ 1e10 |
| **Missing** | Shared money helper; API metadata `unit: "planck"` |
| **Approach** | Central `format_planck` / store raw planck only; never relabel without conversion; optional fiat later with explicit price source |
| **Dependencies** | None for unit fix |
| **Priority** | P0 |
| **Acceptance** | No user-facing string presents raw planck as DOT; reports show both units or converted DOT correctly |
| **Tests** | Unit tests with known 1 DOT = 10^10 planck |
| **Complexity** | M |
| **Type** | **Confirmed defect** |

### T-05 — Filtering

| Field | Content |
|-------|---------|
| **Capability** | Date/block/beneficiary filters |
| **Status** | `PROPOSED` (UI stub) / API missing |
| **Files** | `treasury/page.tsx` “Coming soon”; `TreasuryService.get_spends` |
| **Evidence** | UI disabled; API only skip/limit |
| **Approach** | Add `from_block`, `to_block`, `beneficiary` query params; wire UI |
| **Priority** | P0 |
| **Acceptance** | Filter returns subset matching predicates |
| **Tests** | API integration tests |
| **Complexity** | S |
| **Type** | Confirmed absence |

### T-04 — Display surfaces

| Field | Content |
|-------|---------|
| **Capability** | Consistent DOT display |
| **Status** | `PARTIAL` |
| **Files** | `apps/frontend/app/treasury/page.tsx` (good); overview KPI; legacy `apps/dashboard` if still used |
| **Evidence** | Frontend treasury converts; home shows planck sum string |
| **Approach** | Shared formatter component; deprecate duplicate dashboard app paths |
| **Priority** | P0 |
| **Acceptance** | Overview and treasury page agree on units |
| **Complexity** | S |
| **Type** | Confirmed inconsistency |

### T-03 — List + export

| Field | Content |
|-------|---------|
| **Capability** | API list and CSV |
| **Status** | `IMPLEMENTED` |
| **Evidence** | Router + export endpoints + schedule reuse |
| **Notes** | Entitlements/scopes apply to export; preserve |

### T-08 — Live data completeness

| Field | Content |
|-------|---------|
| **Capability** | Non-zero treasury in production demo |
| **Status** | `NEEDS_VERIFICATION` / `OPS_BLOCKED` |
| **Evidence** | Indexer README: KPIs stay zero until matching extrinsics scanned |
| **Approach** | Same backfill strategy as governance; then verify `COUNT(*) FROM treasury_spends` |
| **Priority** | P0 |
| **Acceptance** | Demo dashboard shows ≥1 real spend with correct DOT |
| **Complexity** | S–M ops |
| **Type** | Hypothesis for empty UI |

### T-02 / project_id

| Field | Content |
|-------|---------|
| **Capability** | Tenant-tagged spends |
| **Status** | `PARTIAL` |
| **Evidence** | Column exists; indexer never sets `project_id` (shared index design) |
| **Approach** | Keep shared index for MVP; do not invent fake project_id without product change |
| **Priority** | P2 (honesty) / Enterprise later |
| **Type** | By design |

---

## 4. What “Treasury Fund Flow” requires (target vs today)

| Target (ANALYSIS) | Today |
|-------------------|-------|
| Inflow/outflow ledger | Outflow rows only (spends); no inflow model |
| Referendum-to-payment link | **Missing** |
| Beneficiary analysis | Beneficiary string listed; no clustering/analytics |
| DOT + historical fiat | DOT conversion partial; fiat **absent** |
| Exception detection | Compliance scaffold separate; not auto-wired |
| Asset Hub | Not in parser match set |

**Recommendation:** Extend existing indexer + `TreasurySpend` rather than a new microservice.

---

## 5. Smallest technically sound P0 treasury sequence

1. Fix **unit labeling defects** (reports/alerts/overview).  
2. **Verify/backfill** spends in production DB.  
3. Add API/UI **filters**.  
4. Add **linkage columns** + parser enrichment.  
5. Dedup extrinsic/event double inserts.

Await authorization before implementation.
