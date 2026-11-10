# P0–2 — Historical Backfill Readiness

**Prerequisite:** [P0-1-VERIFICATION-REPORT.md](./P0-1-VERIFICATION-REPORT.md)  
**Date:** 2026-11-10  
**This document does not authorize backfill.** It defines readiness, scope, and GO criteria only.

---

## 1. GO / CONDITIONAL GO / NO-GO

| Decision | **`CONDITIONAL GO`** |
|----------|----------------------|
| Meaning | Backfill may proceed **only after** the entry criteria below are met and **explicit P0–2 authorization** is granted. |
| Why not GO | Production API↔DB binding not proven via authorized stats (403); public RPC historical access not verified from this environment; indexer restart/reindex is disruptive and was **out of scope** for P0–1. |
| Why not NO-GO | Root cause of zeros is **evidenced** (empty governance tables + narrow/stale index); a controlled range reindex procedure **exists** (`reindex-range.sh`); uniqueness risks are understood and mitigable with delete-range + exclusive indexer. |

---

## 2. Recommended backfill scope (when authorized)

### 2.1 Primary objective

Recover **independently known** OpenGov and treasury chain events into PostgreSQL with correct identifiers and raw planck values, without corrupting live tip indexing.

### 2.2 Suggested height strategy (planning)

| Tier | Approx range | Purpose | RPC need |
|------|--------------|---------|----------|
| A — Credibility sample | Include known refs ~**26863900–26924000** (e.g. ref 1674 window) and treasury spend ~**28040602** | Prove parser+RPC against Subscan/Dune | **Archive-capable** |
| B — Recent continuity | From chosen start through tip | Resume live indexing after historical gap | Archive until near tip; public may work near tip |
| C — Avoid | Blind “last 25k only” from tip | Repeats current failure mode | — |

**Do not** rely on `INDEXER_START_BLOCK=31370000` alone while cursor remains at ~32.80M — it will **not** rewind.

**Preferred mechanical procedure (existing):**  
`deploy/alibaba/reindex-range.sh START [END]`  
→ stops indexer → deletes dependent rows for range → sets start → starts indexer.

Alternative full wipe (`demo-backfill.sh`) is **not** recommended for production.

### 2.3 Explicit non-goals for first authorized backfill

- Full genesis→tip in one pass  
- Schema migrations / parser rewrites (track separately unless verification proves decode failure on known blocks)  
- Concurrent multi-writer replay  

---

## 3. P0–2 entry criteria (must all be true)

| # | Criterion | Evidence required |
|---|-----------|-------------------|
| E1 | Authorized confirmation that the Neon host used in P0–1 is the production API database **or** fresh read-only counts from prod | Ops attestation / authorized stats |
| E2 | Archive-capable (or proven historical) RPC endpoint selected for the planned START height | Provider docs + successful `chain_getBlockHash` + events decode for one reference block on **indexer host** |
| E3 | Exclusive indexer control during range delete/reindex | Single systemd unit; no parallel workers |
| E4 | Written START (and optional END) covering ≥1 OpenGov + ≥1 treasury reference from P0–1 §C | Block list signed off |
| E5 | Explicit authorization to stop indexer, DELETE range rows, and restart | Change ticket / user GO |
| E6 | Backup or snapshot plan for DB (or acceptance of range delete) | Ops note |
| E7 | Rollback: retain ability to re-run same script; tip catch-up plan after history | Runbook |

If any of E1–E5 fail → remain **NO-GO** for execution.

---

## 4. P0–2 exit criteria (acceptance — not “non-zero alone”)

Backfill is **successful** only if **all** of the following hold:

### 4.1 Recovery of expected records

| # | Criterion |
|---|-----------|
| X1 | For each selected OpenGov reference, a `proposals` row exists with **`proposal_index` equal to the on-chain referendum index** (not extrinsic index fallback), unless documented parser limitation for that extrinsic shape |
| X2 | For at least one conviction-voting reference in scope, a `votes` row exists with matching `proposal_index` |
| X3 | For selected treasury reference(s), a `treasury_spends` row exists with **raw planck `value`** matching chain/Subscan (string/numeric equality after normalization) |
| X4 | Reconciliation table completed: reference id → block → expected fields → DB row id → pass/fail |

### 4.2 Integrity

| # | Criterion |
|---|-----------|
| X5 | No duplicate `treasury_spends` for the same payout within the reindexed range under agreed dedup key (at minimum: same block + beneficiary + value), **or** known dual-path duplicates documented with counts |
| X6 | Re-running scanner over already processed heights does **not** increase proposal/vote/spend counts (idempotent via `processed_blocks`) |
| X7 | `blocks.block_number` / `processed_blocks` remain consistent (1:1 for successfully processed heights in range) |

### 4.3 Provenance & continuity

| # | Criterion |
|---|-----------|
| X8 | Each recovered governance/treasury row retains `block_number`; block hash available via `blocks` or `processed_blocks` |
| X9 | After historical catch-up, live indexer resumes toward finalized tip without manual cursor corruption |
| X10 | Interruption test: stop mid-range → restart → continues from `MAX(processed_blocks)` without wiping prior successful range rows |

### 4.4 Financial units

| # | Criterion |
|---|-----------|
| X11 | Stored spend `value` remains **planck** (no premature DOT conversion in DB) |
| X12 | Any demo UI/export used for sign-off labels units correctly (**note:** report/alert DOT mislabel is a separate P0 defect — must not be used as pass evidence until fixed) |

### 4.5 Explicitly insufficient alone

- Non-zero `COUNT(*)` on proposals/votes/spends  
- Dashboard KPI screenshots without reconciliation to Subscan/Dune indices  

---

## 5. Measurable verification standard (template)

For each reference event:

```text
Reference: <referendum_id or treasury_spend_id>
Source: <Subscan/Dune/Polkassembly URL>
Block: <number>  Hash: <0x… when resolved>
Extrinsic/Event: <pallet.method>
Expected: proposal_index=… / voter=… / value_planck=…
DB check: SELECT … ;
Result: PASS | FAIL | BLOCKED
Notes: parser path used (extrinsic vs event)
```

Minimum set: **≥2 OpenGov refs**, **≥1 vote**, **≥1 treasury spend** from P0–1 §C (or replacements with equal provenance).

---

## 6. Replay safety constraints (bind to execution)

| Rule | Classification |
|------|----------------|
| Use stop → delete-range → start only | `CONDITIONALLY_SAFE` |
| Never delete only `processed_blocks` | Prevents `UNSAFE` duplicates |
| No parallel indexer/replay | Avoid `UNSAFE` races |
| Prefer archive RPC for START ≪ tip | Avoid false empty results |

Details: P0–1 §D.

---

## 7. Parallel work (not substitutes for backfill)

These improve credibility but **do not** replace P0–2:

- Fix proposal list `proposal_index` navigation  
- Fix planck/DOT labeling in reports/alerts  
- Restore Console availability  
- SMTP / Razorpay ops  

---

## 8. Residual risks after a successful P0–2

- Incomplete OpenGov lifecycle (tracks/deposits) still `PROPOSED`/`PARTIAL`  
- Referendum→spend FK still missing  
- Event whitelist gaps remain  
- Dedup not schema-enforced until engineered  

---

## 9. Authorization gate

| Milestone | Status |
|-----------|--------|
| P0–1 verification | **Complete** (this package) |
| P0–2 backfill execution | **Not started — await separate authorization** |

**STOP.**
