# P0–3 — Governance & Financial Correctness Implementation

**Authorization:** Local application code + tests only  
**Date:** 2026-11-10  
**Production deploy / backfill:** not performed  

---

## 1. Verdict

| Decision for production preparation | **`CONDITIONAL GO`** |
|-------------------------------------|----------------------|
| Meaning | D1–D3 root causes fixed in code with local regression evidence; migrate `h8i9j0k1l2m3` + redeploy still required under separate auth |
| Blockers for unconditional GO | Shared/prod migration not applied; staging HTTP E2E not re-run with full venv; Asset Hub registry still partial |

---

## 2. Root causes

| Defect | Root cause | Fix |
|--------|------------|-----|
| Spurious `proposal_index=2` | `_build_proposal` used **extrinsic index** when `Referenda.submit` args lacked on-chain referendum index | Require authoritative `ref_index`/`poll_index`/`index`; otherwise **skip** proposal row (rely on `Referenda.Submitted` event) |
| Unordered proposal detail | `get_proposal` used SQLAlchemy `.first()` across multi-row lifecycle | Deterministic sort by `(block_number, event_index/extrinsic_index, method_rank, id)`; detail uses latest as state + ordered `lifecycle` |
| USDC labeled planck/DOT | Treasury stored bare `value`; CSV `value_planck`; alerts/reports assumed DOT | Asset metadata columns + registry; per-asset aggregation; refuse mixed totals |

---

## 3. Modified files

| Area | Paths |
|------|-------|
| Indexer parser/assets | `apps/indexer/src/parser.py`, `assets.py` (new), `models.py`, `integrity.py` |
| Backend governance | `apps/backend/src/services/governance.py`, `schemas/vote.py` |
| Backend money | `apps/backend/src/money.py` (new), `models/proposal.py`, `schemas/treasury.py`, `schemas/stats.py`, `services/stats.py`, `export_csv.py`, `alert_service.py`, `report_service.py` |
| Migration | `apps/backend/migrations/versions/h8i9j0k1l2m3_treasury_asset_metadata.py` |
| Frontend copy | `apps/frontend/app/exports/page.tsx` (CSV field list) |
| Tests | `apps/indexer/tests/test_p03_correctness.py`, parser updates; `apps/backend/tests/test_p03_correctness.py` |

---

## 4. Schema / API changes

### DB (`treasury_spends`) — migration `h8i9j0k1l2m3`

Additive nullable columns: `source_chain`, `asset_id`, `asset_symbol`, `decimals`, `amount_display`, `display_status`.  
Legacy rows backfilled as `display_status=unresolved` (does **not** assume DOT).

### API (compatible extensions)

- `ProposalDetailResponse.lifecycle[]` — ordered history (additive).  
- `TreasurySpendResponse` — additive asset fields; `value` remains raw amount string.  
- `StatsOverview` — `treasury_aggregation`, `treasury_by_asset[]`; `total_treasury_spend` is single-asset raw sum or `"mixed_assets"`.  
- Proposal list returns **one canonical row per `proposal_index`** (latest lifecycle).  
- Treasury CSV headers: `amount_raw`, asset fields (no `value_planck`).

---

## 5. Migration compatibility

- Additive only; verified locally: `alembic upgrade head` on disposable `polkaudit_p03_mig`.  
- **Do not apply to shared/production** without authorization.  
- Re-index required for historical rows to gain resolved USDC/DOT metadata (legacy stays unresolved).

---

## 6. Remaining risks

1. Incomplete on-chain asset registry (unknown `GeneralIndex` → unresolved).  
2. Clients that expected every lifecycle row in `/proposals` list now see canonical latest only.  
3. Stats `total_proposals` now counts **distinct** indices (correct) — KPI may drop vs inflated lifecycle counts.  
4. Alert threshold still compares string/raw `value` across assets (pre-existing weakness; not silently converted to DOT).

---

## 7. Production deployment prerequisites

1. Apply `h8i9j0k1l2m3` on target under change control.  
2. Deploy indexer + backend with P0–3 code.  
3. Bounded reindex or backfill for asset metadata on existing spends.  
4. Staging smoke: proposal 1674 detail lifecycle order; spend #201 USDC display; mixed-asset stats refuse.  
5. Explicit auth before any production historical backfill.

**STOP.**
