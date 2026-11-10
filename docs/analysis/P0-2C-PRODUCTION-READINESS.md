# P0–2C — Production Preparation Readiness

**Date:** 2026-11-10  
**Scope of this document:** Whether the project may **prepare** for production historical indexing — **not** authorization to run production backfill.

---

## 1. Decision

| Gate | **`CONDITIONAL GO`** for production **preparation** |
|------|------------------------------------------------------|
| Production historical backfill | **NO-GO** until separate explicit authorization + prerequisites below |
| Isolated E2E (this gate) | **Complete** on `polkaudit_p02c_e2e` |

---

## 2. What is proven

1. Alembic `g7h8i9j0k1l2` applies cleanly on a fresh local DB.  
2. FinalizedScanner + live Polkadot RPC can index golden OpenGov/treasury heights.  
3. v2 `event_key` identities stable across full re-pass; no unexpected growth.  
4. Integrity-preserving resume after interrupt (ProcessedBlock gate + idempotent inserts).  
5. Exclusive writer lock fails closed under contention.  
6. Backend stats/governance/treasury/CSV **service** paths read isolated data.  
7. Coverage cursor does **not** falsely claim full history.

Evidence: [P0-2C-E2E-TEST-REPORT.md](./P0-2C-E2E-TEST-REPORT.md), [P0-2C-RECONCILIATION.md](./P0-2C-RECONCILIATION.md), `docs/analysis/p02c_artifacts/`.

---

## 3. Conditions before production preparation continues

| # | Condition | Why |
|---|-----------|-----|
| C1 | Fix or suppress **D1** (`Referenda.submit` fake `proposal_index`) | Pollutes proposal lists/CSV/stats |
| C2 | Define read-model ordering/collapse for multi-row referenda (**D2**) | Detail API correctness |
| C3 | Clarify treasury **asset units** in API/CSV/stats (**D3**) | Financial misinterpretation risk |
| C4 | Target-env duplicate assessment + change-controlled migration apply | Schema safety |
| C5 | Archive-capable RPC for sustained ranges | Public RPC is not an ops plan |
| C6 | Exclusive indexer + updated `reindex-range.sh` cursor reset | Dual-writer / gap risk |
| C7 | Capture **Awarded/payout** height for spend lifecycle claim (optional for prep, required for full treasury story) | Completeness |
| C8 | Staging E2E with full HTTP stack (complete dependency install) | uvicorn deps missing in this workspace |

---

## 4. Explicit non-actions (until authorized)

- No production/shared DB migration  
- No production historical backfill  
- No deployment of indexer/API from this gate  
- No credential or infra changes  
- No commits/pushes performed under this authorization  

---

## 5. Suggested next authorization packages (choose one)

1. **Prep-only:** Implement D1–D3 fixes + staging HTTP E2E (still no prod backfill).  
2. **Staging backfill:** Apply migration on disposable staging DB; bounded range including golden refs; reconciliation report.  
3. **Production backfill:** Only after 1–2 succeed and a dedicated production change ticket.

---

## 6. Final line

**CONDITIONAL GO** — production *preparation* may proceed once C1–C6 are scheduled; **do not** auto-start production backfill.

**STOP.**
