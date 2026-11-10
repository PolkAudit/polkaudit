# P0–4 — Controlled Deployment Runbook

**Status:** Draft for authorization — **do not execute** under current P0–4 scope.  
**Date:** 2026-11-10  

---

## 0. Prerequisites (gate)

- [ ] Explicit written authorization for migrate / deploy / backfill separately  
- [ ] Production DB backup verified restorable  
- [ ] Single-writer topology confirmed (no local/shared Neon writing to prod)  
- [ ] Archive RPC endpoint provisioned for any planned backfill  
- [ ] Rollback images tagged for current prod indexer + backend + frontend  

---

## 1. Database compatibility

| Phase | Schema | Old app | New app |
|-------|--------|---------|---------|
| Pre-g7 | Current | OK | New code may expect `event_key` / cursor — avoid long skew |
| Post-g7, pre-h8 | event_key + cursor | Read-mostly OK; **old indexer must not write** null keys | New indexer OK |
| Post-h8 | + asset metadata | API ignoring new cols OK | New API/stats/export OK |

**Assessment:** Old application versions can **read** the new schema with low risk if they do not insert governance rows without `event_key`. **Old indexer writers are not safe** against post-g7 constraints. Prefer migrate → deploy indexer+backend in one maintenance window.

**DB rollback after new writes:** **Not assumed safe.** Prefer restore from pre-migrate backup if aborting.

---

## 2. Migration prerequisites

1. Stop exclusive writers (indexer) or put in maintenance.  
2. Snapshot / backup.  
3. Dry-run duplicate check on proposals/votes/treasury natural keys.  
4. `alembic upgrade g7h8i9j0k1l2` then `h8i9j0k1l2m3` (or `upgrade head`).  
5. Verify: `alembic current` = `h8i9j0k1l2m3`, sample legacy `event_key` / asset cols.  

---

## 3. Release order

1. **Migrate DB** (authorized).  
2. **Indexer** (event_key, WriterLock, cursor, assets).  
3. **Backend** (money, stats, export, alerts, reports).  
4. **Frontend** (export labels) — can trail briefly.  
5. Confirm **exclusive writer** (one indexer replica / lock held).  
6. **Do not** start historical backfill until separate GO.

---

## 4. Exclusive writer activation

- Ensure only one indexer process targets the DB.  
- Confirm advisory lock acquisition in logs.  
- Disable dual envs sharing prod `DATABASE_URL`.  
- `reindex-range.sh` only after authorized range plan (resets cursor).  

---

## 5. Monitoring & health

| Check | Expect |
|-------|--------|
| Indexer heartbeat / block advance | Contiguous `contiguous_through` moves |
| `IntegrityConflictError` rate | Zero sustained |
| WriterLock contention | None |
| API `/health` | 200 |
| Stats / treasury endpoints | Non-error; mixed assets not falsely summed |
| Error budget on CSV export | No 500 on unresolved assets |

---

## 6. Recovery / rollback

| Scenario | Action |
|----------|--------|
| Bad deploy, schema OK | Roll back app images; keep schema |
| Migrate failure before new writes | Restore backup; investigate |
| Bad data after new indexer writes | Stop writer; restore backup; do not `alembic downgrade` in prod unless rehearsed |
| Lock stuck | Investigate holder PID; do not force unlock without auth |

---

## 7. Historical backfill readiness checklist (do not execute)

Aligned with `P0-2-BACKFILL-READINESS.md` / `P0-2A-SAFE-BACKFILL-PLAN.md`.

### Exact planned ranges (first authorized window)

| Tier | Range | Purpose |
|------|-------|---------|
| A — Credibility | **26863900–26924000** (covers ref **1674** @ **26863938** / outcomes through ~**26923064**) | OpenGov sample |
| A′ — Treasury | Include **28040602** (known spend fixture) | Treasury asset path |
| B — Continuity | After A reconcile, extend toward tip under exclusive writer | Live resume |

Do **not** set `INDEXER_START_BLOCK=31370000` alone while cursor remains ~32.80M — it will not rewind without range delete.

### Requirements

| Item | Requirement |
|------|-------------|
| Archive RPC | Required for Tier A heights; smoke `chain_getBlockHash` + events on indexer host |
| Expected events | Ref 1674 Submitted; vote poll 1666 via extrinsic; treasury spend raw value match Subscan/Dune |
| Exclusive writer | Stop parallel indexers; acquire WriterLock; use `reindex-range.sh` (deletes children + processed + resets cursor) |
| Backup | Snapshot before DELETE range |
| Reconciliation | X1–X15 from P0–2A/P0–2 readiness (identifiers + planck, not “non-zero KPIs”); second pass Δ=0 |
| Abort | IntegrityConflictError sustained, lock loss, DLQ growth without progress, wrong `proposal_index`, cursor past END |
| Recovery | Stop writer; restore backup **or** re-run same delete-range + bounded START/END; do not assume alembic downgrade |

### Execution order (when separately authorized)

1. Backup.  
2. Exclusive writer.  
3. Set exact `INDEXER_START_BLOCK` / `INDEXER_END_BLOCK`.  
4. Archive RPC.  
5. Bounded catch-up; abort on conflict / lock loss / RPC failure.  
6. Reconcile vs golden refs; only then clear END / tip catch-up.  
