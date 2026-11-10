# P0–2C — Record-Level Reconciliation

**Database:** `localhost` / `polkaudit_p02c_e2e`  
**Sources:** Chain RPC capture (golden evidence) ↔ parser/persistence ↔ API services  

Non-zero counts alone are **not** success criteria.

---

## 1. Reconciliation matrix

| # | Expected chain event | Parsed | Persisted | API / export | Status |
|---|----------------------|--------|-----------|--------------|--------|
| R1 | Block 26863938 hash `0xea695b0b…` | hash match | `blocks` + `processed_blocks` | stats blocks include height | **PASS** |
| R2 | `Referenda.Submitted` idx **61**, referendum **1674** | proposal 1674 / Submitted / Proposed | row id=2, event_key `…:e:61:Referenda.Submitted` | list contains 1674; detail available | **PASS** |
| R3 | `Referenda.submit` extrinsic idx **2** | also emits proposal | row id=1, **`proposal_index=2`** (extrinsic fallback) | appears in list/CSV as index 2 | **DEFECT** (spurious business id) |
| R4 | `ConvictionVoting.vote` extrinsic idx **3**, poll **1666**, Nay, balance 1e11 | vote row | id=1, proposal_index=1666, Nay, `100000000000`, key `…:x:3:ConvictionVoting.vote` | `get_votes_for_proposal(1666)` returns 1 | **PASS** |
| R5 | `ConvictionVoting.Voted` event idx **68** | skipped (no poll_index) | no duplicate vote from event | n/a | **PASS** (by design; documented limitation) |
| R6 | Block 26863939 contiguous | processed | processed; cursor advanced then later reset by island jumps | last_indexed reflects later island | **PASS** data / **PARTIAL** cursor metadata |
| R7 | Block 26875641 `Submitted` **1676** | yes | row id=4, key `…:e:63:Referenda.Submitted` | list includes 1676 | **PASS** |
| R8 | Extrinsic submit on 26875641 | proposal_index=2 again | row id=3 | CSV noise | **DEFECT** (same as R3) |
| R9 | Block 26923064 `Confirmed` **1674** | yes | row id=5, status Approved, key `…:e:3:Referenda.Confirmed` | detail `.first()` may return Submitted **or** Confirmed | **PASS** persist / **DEFECT** API selection |
| R10 | Same block `Confirmed` **1673** | yes | row id=6 | listed | **PASS** (side event in window) |
| R11 | Block 28040602 `Treasury.AssetSpendApproved` #201 amount **795500000000** | spend row | value exact; beneficiary contains `0xa265…055a`; key `…:e:0:Treasury.AssetSpendApproved` | treasury list + CSV value match; stats SUM scientific notation | **PASS** amount / **PARTIAL** unit labeling |
| R12 | Treasury **payment/Awarded** for #201 | not in selected block | absent | absent | **GAP** (expected; not in scope height) |

---

## 2. Identity stability (first vs second pass)

| Field | First | Second | Match |
|-------|-------|--------|-------|
| proposal event_keys (6) | snapshot_first | snapshot_second | identical |
| vote event_key | `…26863938:x:3:ConvictionVoting.vote` | same | identical |
| treasury event_key | `…28040602:e:0:Treasury.AssetSpendApproved` | same | identical |
| treasury value | `795500000000` | `795500000000` | identical |
| table counts | 5/18/6/1/1 | 5/18/6/1/1 | Δ=0 |

---

## 3. Financial units

| Record | Stored value | Meaning | Consumer labeling |
|--------|--------------|---------|-------------------|
| Spend #201 approval | `795500000000` | USDC raw (6 decimals → 795,500 USDC) per Subscan | CSV column `value_planck` **incorrect name**; stats returns `7.955E+11` string |

**Do not treat** stored value as DOT planck for this asset spend.

---

## 4. Cursor / coverage honesty

After multi-island indexing:

```json
"verified_contiguous_range": [28040602, 28040602],
"claims_full_history": false,
"historical_gaps": [ {"start":1,"end":28040601,"reason":"below_verified_range"}, ... ]
```

All five blocks remain in `processed_blocks`, but cursor singleton describes the **latest segment**, not the union of islands. Reconciliation of **data** must query tables; cursor alone must not be used as proof of full selected-set coverage.

---

## 5. Discrepancy register

| ID | Severity | Description | Disposition |
|----|----------|-------------|-------------|
| D1 | High (data quality) | `Referenda.submit` → fake `proposal_index` | Fix parser: do not persist proposal from submit without on-chain index; prefer event-only for OpenGov submit |
| D2 | Medium (API) | Multiple rows per referendum; unordered `.first()` | Order by block_number/method or collapse lifecycle in read model |
| D3 | Medium (UX/units) | `value_planck` / scientific stats for asset amounts | Rename/annotate asset units; format SUM as decimal string |
| D4 | Low (ops) | Cursor not multi-segment | Document; optional multi-range coverage table later |
| D5 | Scope gap | No Awarded/disbursement fixture | Capture payout height before claiming full treasury lifecycle |

---

## 6. Success assessment

| Criterion | Met? |
|-----------|------|
| Expected Submitted/Confirmed/vote/AssetSpendApproved recovered | **Yes** (with D1 noise rows) |
| Accurate referendum ids on event-path rows | **Yes** |
| Raw financial amount for #201 preserved | **Yes** |
| Duplicate inserts on replay avoided | **Yes** |
| Interrupt recoverable | **Yes** |
| Block-level provenance (`event_key` + block hash) | **Yes** |
| Dashboard non-zero alone | Not used as sole criterion |

**Overall reconciliation:** **CONDITIONAL PASS** — golden events present and stable; D1–D3 must be tracked before production credibility claims.
