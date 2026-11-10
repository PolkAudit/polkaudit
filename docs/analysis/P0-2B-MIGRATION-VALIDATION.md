# P0–2B Stage B — Alembic Migration Validation

**Migration:** `g7h8i9j0k1l2_indexer_event_keys_cursor.py`  
**Date:** 2026-11-10  
**Database:** disposable local `polkaudit_p02b_mig_test` only  
**Shared/production:** **not** contacted  

---

## 1. Procedure executed

```bash
dropdb --if-exists polkaudit_p02b_mig_test
createdb polkaudit_p02b_mig_test
cd apps/backend
export DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_mig_test'
export API_KEY='test-local-only'

alembic upgrade f6a7b8c9d0e1   # schema immediately before g7h8i9j0k1l2

# Insert legacy rows (no event_key columns)
psql -d polkaudit_p02b_mig_test <<'SQL'
INSERT INTO blocks (...) VALUES (100, '0xlegacyblock', ...);
INSERT INTO extrinsics (...) VALUES (...);
INSERT INTO proposals (proposal_index=42, ...);
INSERT INTO votes (...);
INSERT INTO treasury_spends (value='999', ...);
INSERT INTO processed_blocks (100, '0xlegacyblock');
SQL

alembic upgrade g7h8i9j0k1l2
```

---

## 2. Results

| Check | Result |
|-------|--------|
| Pre-migration row counts | proposals=1, votes=1, spends=1, extrinsics=1 |
| Post-migration row counts | **unchanged** (all preserved) |
| Legacy `event_key` values | `legacy:proposal:1`, `legacy:vote:1`, `legacy:treasury:1`, `legacy:extrinsic:1` |
| Chain-derived keys overwritten? | **No** — zero rows with non-`legacy:` keys after migrate |
| `source` on governance rows | `legacy` |
| UNIQUE constraints created | `uq_*_event_key`, `uq_extrinsics_block_extrinsic_index` |
| `indexer_cursor` bootstrap | `range_start=100`, `contiguous_through=100`, `coverage_complete=0`, gap `{1..99, below_verified_range}` |
| Application models | Compatible with new nullable columns + cursor JSON fields |

---

## 3. Compatibility assessment

- Additive columns + synthetic legacy keys before UNIQUE → safe for empty/sparse governance tables (matches prior P0–1 empty governance observation).  
- Legacy keys **never** collide with v2 chain keys (`polkadot/0x…/…`).  
- Re-indexing after migrate assigns true chain keys on new inserts; legacy rows remain until range delete/reindex.  
- FK/`project_id` relationships untouched.  

---

## 4. Failure behavior (documented)

| Failure mode | Behavior |
|--------------|----------|
| UNIQUE creation with duplicate non-null `event_key` after partial manual backfill | Alembic upgrade aborts (transactional DDL on Postgres); DB remains at prior revision |
| Operator runs assessment queries in migration docstring and finds logical duplicates | Must dedupe/delete **before** apply |
| Downgrade `g7h8i9j0k1l2` | Drops cursor table and new columns/constraints (destructive to Stage B metadata) |
| Applying to shared/prod without change control | **Prohibited** in this authorization |

No intentional destructive failure was forced against shared data. Local unique enforcement is covered by application `IntegrityConflictError` tests after schema exists.

---

## 5. Production / Stage C prerequisites

1. Authorized change window.  
2. Run duplicate-assessment SQL on target.  
3. Backup/snapshot.  
4. `alembic upgrade g7h8i9j0k1l2` on target only.  
5. Deploy indexer build that understands v2 keys + cursor gaps.  
6. Do **not** treat legacy keys as chain-verified identities.  

**STOP for migration task — local only.**
