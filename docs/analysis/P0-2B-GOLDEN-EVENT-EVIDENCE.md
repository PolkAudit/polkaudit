# P0–2B Stage B — Golden Event Evidence

**Date:** 2026-11-10  
**Capture RPC:** `wss://rpc.polkadot.io` via `substrate-interface`  
**Offline fixtures:** `apps/indexer/tests/fixtures/golden/*.json`  

---

## 1. Method

1. Resolve `chain_getBlockHash(block_number)` on public Polkadot RPC.  
2. Decode `System.Events` with substrate-interface.  
3. Persist governance-relevant events (and sparse-filled `parser_events` preserving on-chain indices).  
4. Validate parser offline (no live RPC in pytest).  

**Not invented:** block numbers, hashes, event indices, attributes, and extrinsic call args below were read from chain.  

---

## 2. Reference table

| Fixture | Kind | Block | Finalized hash (RPC) | Positions | Expected PolkAudit fields | Parser result |
|---------|------|-------|----------------------|-----------|---------------------------|---------------|
| `ref1674_submit_and_vote.json` | Referendum submission + vote in block | **26863938** | `0xea695b0bd31b6870c3be90771659b21cd5e4eb3ede83ddd30604fcf3d8bb74e3` | Event **61** `Referenda.Submitted`; Event **68** `ConvictionVoting.Voted`; Extrinsic **2** submit; Extrinsic **3** vote | `proposal_index=1674`, method Submitted | **PASS** Submitted; Voted **skipped** (no `poll_index` in event attrs) |
| `ref1674_confirmed.json` | Lifecycle Confirmed | **26923064** | `0xe70fffc3ed0839eacd222a840a34d7cdf0a016545174dc2856a83716460c0ee5` | Event **3** `Referenda.Confirmed` index 1674 (also 1673 at idx 8) | `proposal_index=1674`, status Approved | **PASS** |
| `ref1676_submitted.json` | Referendum submission | **26875641** | `0xe8fc63304ceafc304d7d7dd856cf9336417b278a3490a911baeff817711cab98` | Event **63** `Referenda.Submitted` | `proposal_index=1676` | **PASS** (Dune “Decision Started” status is later; this height is Submitted) |
| `treasury_spend201_asset_approved.json` | Treasury spend approval | **28040602** | `0xfa153a7c465c12e241d804ffc52af1e82be6b83d177e4bbbf3d578ec05a03801` | Event **0** `Treasury.AssetSpendApproved` index **201** | `value=795500000000` (USDC raw), beneficiary contains AccountId32 `0xa265…055a` | **PASS** after adding `AssetSpendApproved` support |
| `vote_extrinsic_poll1666.json` | Governance vote (extrinsic) | **26863938** | same as submit block | Extrinsic **3** `ConvictionVoting.vote` `poll_index=1666` | Nay, balance `100000000000` | **PASS** via extrinsic path |

Independent explorers (context, not used as hash authority):

- Subscan referenda [#1674](https://polkadot.subscan.io/referenda_v2/1674)  
- Subscan treasury spend [#201](https://polkadot.subscan.io/treasury_spend/201) (created block 28040602, reward 795,500 USDC)  
- Polkassembly [#1674](https://polkadot.polkassembly.io/referenda/1674)  
- Dune OpenGov dashboard (start/end heights for 1674 window)

---

## 3. Hash authority note

A Dune snippet previously cited end_hash `0x62f538…` for referendum 1674.  
**RPC `chain_getBlockHash(26923064)` returns `0xe70fffc3…`.** Golden fixtures and keys use the RPC hash as canonical finalized block identity.

---

## 4. Documented chain/parser limitations

| Limitation | Evidence | Handling |
|------------|----------|----------|
| `ConvictionVoting.Voted` attributes omit `poll_index` on Polkadot | Block 26863938 event 68 | Event path skips; extrinsic path required for vote→poll binding |
| Treasury OpenGov asset spends emit `AssetSpendApproved`, not only `Awarded`/`SpendApproved` | Block 28040602 event 0 | Whitelist + handler added in Stage B |
| Native DOT `Treasury.Awarded` disbursement for spend #201 not captured in this gate | Subscan status “awarded” implies later payout block | **Gap reported** — no invented disbursement fixture |
| Exact extrinsic index inside full block for submit is **2** | `get_block` | Recorded in `ref1674_submit_extrinsic.json` |

---

## 5. Event identity examples (v2 keys)

```
polkadot/0xea695b0bd31b6870c3be90771659b21cd5e4eb3ede83ddd30604fcf3d8bb74e3/26863938:e:61:Referenda.Submitted
polkadot/0xe70fffc3ed0839eacd222a840a34d7cdf0a016545174dc2856a83716460c0ee5/26923064:e:3:Referenda.Confirmed
polkadot/0xfa153a7c465c12e241d804ffc52af1e82be6b83d177e4bbbf3d578ec05a03801/28040602:e:0:Treasury.AssetSpendApproved
```

Business identity remains `proposal_index` / spend index inside attributes; event identity includes chain + finalized hash + position.

---

## 6. Offline test command

```bash
cd apps/indexer
P02B_TEST_DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
DATABASE_URL='postgresql+asyncpg://localhost/polkaudit_p02b_test' \
python3 -m pytest tests/test_golden_fixtures.py tests/test_stage_b_replay.py -v
```
