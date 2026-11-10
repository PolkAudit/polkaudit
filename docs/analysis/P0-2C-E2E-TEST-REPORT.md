# P0–2C — Isolated End-to-End Historical Backfill Test Report

**Authorization:** Disposable local database only  
**Date:** 2026-11-10  
**Database identity:** PostgreSQL `localhost` / `polkaudit_p02c_e2e` (created for this gate; not shared/prod)  
**RPC:** `https://rpc.polkadot.io` (HTTP block fetch) + `wss://rpc.polkadot.io` (events via substrate-interface)  

---

## 1. Verdict (short)

The hardened `FinalizedScanner` successfully indexed **bounded golden Polkadot heights**, persisted governance/treasury rows with stable v2 `event_key`s, survived a second pass with **zero row growth**, recovered after simulated interrupt, and exposed matching data through backend **service/API code paths**.

**Final recommendation for production preparation:** **`CONDITIONAL GO`**  
(see [P0-2C-PRODUCTION-READINESS.md](./P0-2C-PRODUCTION-READINESS.md)).  
**Not authorized / not performed:** production migration, production backfill, shared DB writes.

---

## 2. Environment preparation (Task 1)

```bash
dropdb --if-exists polkaudit_p02c_e2e && createdb polkaudit_p02c_e2e
cd apps/backend
export DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02c_e2e'
export API_KEY='p02c-local-e2e-key'
alembic upgrade head   # includes g7h8i9j0k1l2
```

| Check | Result |
|-------|--------|
| Schema to head | OK |
| `uq_*_event_key` constraints | Present |
| `indexer_cursor` columns | `range_start`, `contiguous_through`, `historical_gaps`, `coverage_complete` |
| Exclusive writer | `WriterLock` acquire OK; second acquire → `ExclusiveLockError` |
| API models | Proposal/Treasury/Vote responses validate against persisted rows |

Artifacts: `docs/analysis/p02c_artifacts/`.

---

## 3. Historical block selection (Task 2)

Bounded islands from [P0-2B-GOLDEN-EVENT-EVIDENCE.md](./P0-2B-GOLDEN-EVENT-EVIDENCE.md) plus contiguous +1:

| Label | Block | Hash (verified at runtime) | Expected |
|-------|-------|----------------------------|----------|
| ref1674 submit+vote | 26863938 | `0xea695b0b…bb74e3` | Submitted 1674; vote poll **1666** via extrinsic |
| contiguous +1 | 26863939 | `0x52f847a9…6d7fa7` | Cursor advances; may have no governance |
| ref1676 submit | 26875641 | `0xe8fc6330…1cab98` | Submitted 1676 |
| ref1674 confirmed | 26923064 | `0xe70fffc3…0c0ee5` | Confirmed 1674 (also 1673) |
| treasury spend #201 | 28040602 | `0xfa153a7c…a03801` | `AssetSpendApproved` value `795500000000` |

**Not included (documented gap):** native `Treasury.Awarded` disbursement for spend #201 (approval only at 28040602).

Driver: `apps/indexer/scripts/p02c_e2e_backfill.py`.

---

## 4. End-to-end replay (Task 3)

```bash
cd apps/indexer
python3 scripts/p02c_e2e_backfill.py \
  --database-url 'postgresql+asyncpg://localhost/polkaudit_p02c_e2e' \
  --http-rpc 'https://rpc.polkadot.io' \
  --ws-rpc 'wss://rpc.polkadot.io' \
  --out-dir docs/analysis/p02c_artifacts \
  --pass-name first
```

### First-pass counts

| Metric | Value |
|--------|-------|
| blocks / processed | 5 / 5 |
| extrinsics | 18 |
| proposals | 6 |
| votes | 1 |
| treasury_spends | 1 |
| DLQ | 0 (after first pass; +1 after interrupt simulation) |

### Observed extractions

- Blocks/extrinsics persisted for all five heights.  
- Referendum **1674** Submitted (event) + Confirmed (later block).  
- Referendum **1676** Submitted.  
- Vote: voter `11fx8x…dkM`, poll **1666**, Nay, balance `100000000000`.  
- Treasury: value `795500000000`, beneficiary contains AccountId32 `0xa265…055a`, stable event_key.  
- Contiguous advance 26863938→26863939 succeeded.  
- Failed blocks do not skip: interrupt left `ProcessedBlock` absent until resume.

### Genuine defects observed (not papered over)

1. **`Referenda.submit` extrinsic fallback** creates extra proposal rows with `proposal_index = extrinsic_index` (e.g. **2**) because call args lack on-chain referendum index. Correct index arrives from `Referenda.Submitted` event.  
2. **Multi-row `proposal_index`** (Submitted + Confirmed) → API `.first()` is unordered.  
3. **Cursor metadata** after multi-island indexing reflects **latest segment only**; prior islands remain in tables but `verified_contiguous_range` does not union them (`claims_full_history=false`, gaps explicit).  
4. **Treasury CSV header `value_planck`** is misleading for USDC asset spend raw units.

---

## 5. API verification (Task 4)

Full `uvicorn` import failed in this workspace (`ModuleNotFoundError: slowapi` after installing `asgi_correlation_id`).  

**Substitute (same service layer as routes):**

```bash
cd apps/backend
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02c_e2e' \
API_KEY='p02c-local-e2e-key' \
P02C_OUT=docs/analysis/p02c_artifacts/api_verify.json \
python3 scripts/p02c_api_verify.py
```

| Surface | Result |
|---------|--------|
| Stats overview | proposals=6, votes=1, blocks=5, extrinsics=18, treasury sum `7.955E+11` |
| Proposal list | 6 rows (includes spurious index 2) |
| Proposal 1674 detail | Present; method depends on `.first()` order |
| Votes for 1666 | 1 row Nay / 1e11 balance |
| Treasury list | 1 row; value `795500000000` |
| CSV proposals | header `id,index,block,section,method,proposer,status` |
| CSV treasury | header `id,block,beneficiary,value_planck` — **unit naming defect** |

Artifact: `p02c_artifacts/api_verify.json`.

---

## 6. Replay safety (Task 5)

```bash
# second pass
python3 scripts/p02c_e2e_backfill.py ... --pass-name second
```

| Check | Result |
|-------|--------|
| Row growth first→second | **0** all tables |
| Event keys unchanged | **Yes** |
| Treasury amount unchanged | **Yes** `795500000000` |
| Silent integrity conflicts | **None** |
| Interrupt then resume (28040602) | Failure → DLQ; resume restores `ProcessedBlock`; treasury count stays 1; same `event_key` |
| Writer lock contention | Second lock fails safely |

Interrupt artifact: `p02c_artifacts/interrupt_resume.json`.

---

## 7. Commands summary

| Step | Command |
|------|---------|
| DB | `createdb polkaudit_p02c_e2e` |
| Migrate | `alembic upgrade head` (backend) |
| Index first/second | `scripts/p02c_e2e_backfill.py --pass-name first\|second` |
| API services | `scripts/p02c_api_verify.py` |
| Unit/regression | Prior Stage B: 47 passed (unchanged gate) |

---

## 8. Stop

P0–2C local E2E complete. Await authorization before any production preparation actions beyond documentation.
