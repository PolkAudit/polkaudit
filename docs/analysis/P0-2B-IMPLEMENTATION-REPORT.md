# P0–2B Stage A — Local Replay Safety Hardening

**Authorization:** Local source + local test DB only  
**Date:** 2026-11-10  
**Stage B:** Not started — await separate authorization  

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Can repeated processing silently duplicate governance/treasury rows? | **Mitigated locally** via deterministic `event_key` + `UNIQUE` + `ON CONFLICT DO NOTHING` |
| Is `MAX(processed_blocks)` treated as contiguous proof? | **No** — `indexer_cursor` certifies `[range_start, contiguous_through]`; bootstrap refuses to claim a gapped span |
| Exclusive writer? | **Yes** — PostgreSQL advisory lock (`WriterLock`); fail-closed on contention |
| Production / shared DB changed? | **No** |
| Migration applied to prod? | **No** (file only) |
| Stage B (controlled backfill) | **CONDITIONAL GO** after migration apply on target env + duplicate assessment |

Replay safety claim: **local evidence supports identity-preserving idempotency** under the new schema and tests. This is **not** a production safety certification.

---

## 2. Event identity design

### 2.1 Separation of identities

| Concept | Field / key | Meaning |
|---------|-------------|---------|
| **Business identity** | `proposal_index` | On-chain referendum / democracy index (API contract unchanged) |
| **On-chain event identity** | `event_key` | Deterministic id of a specific extrinsic leaf or System.Events entry |
| **Block identity** | `(block_number, block_hash)` | Existing unique columns on `blocks` |
| **Extrinsic identity** | `event_key` + `(block_number, extrinsic_index)` | Position in block, not call payload alone |

### 2.2 `event_key` format (`apps/indexer/src/identity.py`)

| Origin | Format | Example |
|--------|--------|---------|
| Extrinsic | `{block}:x:{extrinsic_index}:{Pallet}.{call}` | `1000:x:0:Treasury.spend` |
| Extrinsic leaf (batch) | `…:leaf:{leaf_index}` | `50:x:1:Treasury.spend:leaf:0` |
| System event | `{block}:e:{event_index}:{Pallet}.{Event}` | `2000:e:1:Treasury.Awarded` |

**Explicitly rejected uniqueness criteria**

- Treasury: **not** `(beneficiary, amount, block_number)` alone — identical payments in one block remain distinct via `event_index`.
- Votes: **not** vote value alone — same account Aye→Nay uses distinct extrinsic indices / event indices.

### 2.3 Lifecycle vs corruption

Referenda `Submitted` and later `Confirmed`/`Approved`/… are **separate rows** with distinct `event_key`s sharing the same `proposal_index`. Historical event identity is preserved; APIs that select `.first()` by `proposal_index` behave as before (compatibility), while counts may include lifecycle rows.

### 2.4 Multiple legitimate events in one block

Preserved by monotonic `event_index` / `extrinsic_index` inside the key. Test: two `Treasury.Awarded` with identical beneficiary+amount → two rows, two keys.

---

## 3. Modified file inventory

| Path | Change |
|------|--------|
| `apps/indexer/src/identity.py` | **New** — key builders |
| `apps/indexer/src/persistence.py` | **New** — idempotent inserts, cursor advance/bootstrap |
| `apps/indexer/src/writer_lock.py` | **New** — exclusive writer lock |
| `apps/indexer/src/models.py` | `event_key`, provenance cols, `IndexerCursor`, uniques |
| `apps/indexer/src/parser.py` | Assigns `event_key` / indices / source |
| `apps/indexer/src/scanner.py` | Lock, END bound, require-events, idempotent persist, cursor |
| `apps/indexer/src/config.py` | `INDEXER_END_BLOCK`, `INDEXER_REQUIRE_EVENTS` |
| `apps/indexer/.env.example` | New settings documented |
| `apps/backend/src/models/proposal.py` | Matching columns + unique |
| `apps/backend/src/models/indexer.py` | Matching extrinsic/cursor models |
| `apps/backend/migrations/versions/g7h8i9j0k1l2_indexer_event_keys_cursor.py` | **New** migration (not applied to prod) |
| `deploy/alibaba/reindex-range.sh` | Resets `indexer_cursor` on range clear |
| `apps/indexer/tests/*` | Identity + replay safety suite |
| `apps/indexer/pytest.ini` | asyncio mode |

API response schemas (`ProposalResponse`, etc.) **unchanged** — extra DB columns are ignored by existing contracts.

---

## 4. Schema changes (migration `g7h8i9j0k1l2`)

- Add `event_key`, `extrinsic_index`, `event_index`, `source` to proposals / votes / treasury_spends  
- Add `event_key`, `extrinsic_index` to extrinsics  
- Backfill `legacy:{table}:{id}` keys for existing rows  
- `UNIQUE(event_key)` on those tables; `UNIQUE(block_number, extrinsic_index)` on extrinsics  
- Create `indexer_cursor` singleton with contiguity bootstrap  

**Not applied** to shared/production databases in this stage.

---

## 5. Migration compatibility assessment

| Check | Status |
|-------|--------|
| Additive nullable columns first | Yes |
| Legacy synthetic keys before UNIQUE | Yes |
| Risk: UNIQUE fails if two rows somehow share a legacy key | Legacy keys use primary `id` — collision only if id duplicated (impossible) |
| Risk: true chain-key collision after reindex without delete | Mitigated by ON CONFLICT DO NOTHING |
| Pre-apply operator queries | Documented in migration docstring (treasury/vote grouping) |
| Local Stage A validation | `Base.metadata.create_all` on `polkaudit_p02b_test` (not Alembic against Neon) |

**Decision required before Stage B:** run duplicate-assessment SQL on the **target** database, then apply `g7h8i9j0k1l2` under change control. Do not apply blindly to production without that step.

---

## 6. Cursor & writer behavior

| Behavior | Implementation |
|----------|----------------|
| Contiguous progress | `indexer_cursor.contiguous_through` advances only at `+1` or new segment start |
| Gap on bootstrap | If `COUNT != max-min+1`, certify tip-only `[max,max]` |
| Failed block | No `ProcessedBlock`; DLQ row; exception re-raised; retry same height |
| Missing hash/body | Do not advance |
| Event RPC failure | Fail block when `INDEXER_REQUIRE_EVENTS=true` (default) |
| START/END validation | `INDEXER_END_BLOCK` stops; invalid END &lt; START raises |
| Exclusive writer | `pg_try_advisory_lock`; start refuses if busy |

---

## 7. Remaining risks

1. Extrinsic-path + event-path can still both emit records for related activity (different keys) — may increase row counts vs “business unique” expectations; product may later prefer event-preferred filtering.  
2. `get_proposal` still returns `.first()` by `proposal_index` — lifecycle multiplicity not surfaced in detail API.  
3. Advisory lock is per-database; two DBs → two writers (by design).  
4. Legacy `event_key` values are **not** chain-derived — historical rows need reindex to gain true keys.  
5. Default `INDEXER_REQUIRE_EVENTS=true` is a behavior change vs silent empty events.  

---

## 8. Unresolved assumptions

- Production event dict shapes always expose enumerable indices compatible with `enumerate(events)` (substrate-interface).  
- Archive RPC availability for Stage B ranges.  
- Whether shared Neon already contains duplicate treasury/vote rows (assessment not re-run in Stage A; prior P0–1 saw **zero** governance rows).  

---

## 9. Production deployment prerequisites (Stage B entry)

1. Authorized apply of migration `g7h8i9j0k1l2` on target DB after duplicate assessment.  
2. Deploy indexer build with lock + cursor + identity code.  
3. Confirm single indexer unit; advisory lock observable.  
4. Set `INDEXER_START_BLOCK` / `INDEXER_END_BLOCK` for controlled window; archive RPC.  
5. Use updated `reindex-range.sh` (cursor reset) under exclusive stop.  
6. Reconciliation against golden refs (P0–2 exit criteria) — not “non-zero KPIs.”  

---

## 10. GO / NO-GO for Stage B

| Decision | **CONDITIONAL GO** |
|----------|-------------------|
| Meaning | Proceed to Stage B planning/execution **only** after migration apply authorization + RPC + exclusive ops checklist |
| Blockers for unconditional GO | Migration not applied anywhere shared; no production lock soak; event-shape assumption unverified on live RPC |

**STOP.** Await Stage B authorization.
