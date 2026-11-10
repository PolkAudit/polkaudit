# P0–3 — Financial Unit Validation

**Date:** 2026-11-10  

---

## 1. Representation model

| Field | Meaning |
|-------|---------|
| `value` / `amount_raw` | Exact integer as decimal string (no float) |
| `source_chain` | e.g. `polkadot`, `polkadot-asset-hub` |
| `asset_id` | `native` or on-chain asset id (`1337` for AH USDC) |
| `asset_symbol` | Verified symbol only (`DOT`, `USDC`) or null |
| `decimals` | Asset-specific; null if unknown |
| `amount_display` | Exact scaled string when decimals known |
| `display_status` | `resolved` \| `unresolved` |

---

## 2. Verified conversions (local tests)

| Case | Raw | Decimals | Display | Symbol |
|------|-----|----------|---------|--------|
| DOT 1.0 | `10000000000` | 10 | `1` | DOT |
| DOT 1.5 | `15000000000` | 10 | `1.5` | DOT |
| USDC spend #201 | `795500000000` | 6 | `795500` | USDC |
| Unknown asset | any | null | null / unresolved | — |

Spend #201 asset id derived from `AssetSpendApproved.asset_kind` → `GeneralIndex` **1337**.

---

## 3. Aggregation policy

| Situation | `treasury_aggregation` | `total_treasury_spend` |
|-----------|------------------------|------------------------|
| No spends | `empty` | `0` |
| One resolved asset | `single_asset` | raw sum string |
| One unresolved asset | `single_asset_unresolved` | raw sum string |
| Multiple asset keys | `mixed_refused` | `mixed_assets` |

**Never** combine DOT + USDC into one numeric total without an explicit FX methodology (not implemented).

---

## 4. Consumer surfaces

| Surface | Before | After |
|---------|--------|-------|
| CSV | `value_planck` | `amount_raw` + asset metadata |
| Alerts | `"{value} DOT"` | `format_alert_amount` with symbol or unresolved |
| Reports PDF | `{total:,.2f} DOT` via float sum | Per-asset lines; mixed refused |
| Stats | Blind `SUM(value)` | `aggregate_by_asset` |

---

## 5. Open issues

- Threshold alerts still compare raw strings without asset-scoped thresholds.  
- Expanding the asset registry requires verified metadata (no guessing symbols).  
- Legacy DB rows after migrate remain `unresolved` until reindexed.
