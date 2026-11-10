# P0–4 — Migration Readiness (`g7` → `h8`)

**Date:** 2026-11-10  
**Disposable DB:** `localhost` / `polkaudit_p04_mig`  
**Production/shared:** not touched  

---

## 1. Dependency chain

| Revision | Down revision | Purpose |
|----------|---------------|---------|
| `g7h8i9j0k1l2` | `f6a7b8c9d0e1` | event_key uniqueness, provenance cols, `indexer_cursor` |
| `h8i9j0k1l2m3` | `g7h8i9j0k1l2` | treasury asset metadata columns |

Alembic head: **`h8i9j0k1l2m3`** (single head verified).

Upgrade order: … → `f6a7b8c9d0e1` → **`g7h8i9j0k1l2`** → **`h8i9j0k1l2m3`**.

---

## 2. Local verification performed

```bash
createdb polkaudit_p04_mig
alembic upgrade f6a7b8c9d0e1
# insert legacy blocks/extrinsics/proposals/votes/treasury/processed (no event_key)
alembic upgrade head
```

| Check | Result |
|-------|--------|
| Legacy row counts preserved | Yes (1 proposal, 1 treasury, …) |
| Synthetic legacy `event_key` | `legacy:proposal:1`, `legacy:treasury:1` |
| Chain keys not overwritten | Confirmed (still `legacy:`) |
| UNIQUE `event_key` present | Yes |
| `indexer_cursor` bootstrap | range/through=100, `coverage_complete=0`, gap 1–99 |
| `h8` asset cols | Present; legacy treasury `display_status=unresolved`, `asset_id=unknown` |
| Does not assume DOT on legacy | **Yes** |

---

## 3. Compatibility notes

- Both migrations are **additive** (nullable columns + constraints after backfill).  
- Old app versions **without** reading new columns generally continue (ORM ignore / SQL SELECT * consumers may see new cols).  
- Old indexer **writing** without `event_key` will fail UNIQUE/NOT NULL expectations after g7 if it inserts null keys — **deploy indexer with event_key support in same window as g7**.  
- Downgrade after new chain-derived keys exist is **unsafe** for production (data loss / constraint drops). Prefer forward fix + restore from backup.

---

## 4. Failure recovery

| Failure | Recovery |
|---------|----------|
| g7 UNIQUE fails on unexpected duplicate keys | Abort; dedupe; retry (transactional DDL on Postgres) |
| Mid-upgrade crash | Restore snapshot; re-run upgrade |
| App/schema skew | Roll forward app or restore DB from pre-migrate backup |

---

## 5. Production migrate posture

**CONDITIONAL GO** only after: backup, duplicate assessment SQL, maintenance window, indexer+API deploy sequenced with migrate (see runbook).  
**NO-GO** to migrate production under this P0–4 authorization (read-only assessment only).
