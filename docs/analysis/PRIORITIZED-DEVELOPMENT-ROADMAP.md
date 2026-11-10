# Prioritized Development Roadmap (Post Feature-Gap Audit)

**Date:** 2026-11-10  
**Inputs:** [FEATURE-GAP-MATRIX.md](./FEATURE-GAP-MATRIX.md), governance / treasury / audit / production assessments, [ANALYSIS.md](../../ANALYSIS.md)  
**Constraint:** Strengthen existing platform; no unauthorized feature development in this analysis pass.

---

## Executive summary — smallest technically sound P0 sequence

Before any P1 grants/assurance expansion, complete this **credibility path**:

| Step | Work | Why first | Status today | Complexity |
|------|------|-----------|--------------|------------|
| **0** | **Verify** prod DB: proposal/vote/spend counts, indexer cursor, shared `DATABASE_URL` | Distinguishes empty data vs parser failure | `NEEDS_VERIFICATION` | S ops |
| **1** | **Backfill** known OpenGov + treasury block ranges (`reindex-range.sh` / start block) | Fills dashboard zeros without new architecture | `OPS_BLOCKED` until run | S–M ops |
| **2** | **Fix confirmed presentation defects**: planck≠DOT in reports/alerts; proposal list → `proposal_index` | Stops shipping incorrect financial/UX claims once data exists | `PARTIAL` defects | S–M eng |
| **3** | **Ops unblock**: Console probe, SMTP test, Razorpay webhook smoke, privacy copy | Commercial trust; parallel to indexing | `OPS_BLOCKED` / copy `PARTIAL` | S–M ops |
| **4** | **Indexer hygiene**: event handlers for whitelisted events; spend dedup; optional proposal upsert | Increases recall/precision of index | `PARTIAL` | M eng |
| **5** | **Treasury filters + referendum linkage columns** | Enables “where did the money go?” narrative | `PROPOSED` / `PARTIAL` | M–L eng |

**Only after steps 0–2 show non-zero, correct governance/treasury on the live dashboard** should engineering prioritize P1 evidence storage and grants MVP.

**Do not** rebuild Console, billing, auth, or the indexer framework unless verification proves systemic failure (not observed in unit-tested parser paths).

---

## Phase map

### Phase 0 — Verify & activate (0–2 weeks calendar; mostly ops)

| Item | Owner | Priority | Depends on |
|------|-------|----------|------------|
| SQL / `check-governance-data.sh` on prod | Ops | P0 | DB access |
| Reindex historical range | Ops | P0 | Step verify |
| Console HTTPS + cert | Ops | P0 | — |
| SMTP + Razorpay smoke | Ops | P0 | Secrets |
| Landing privacy/ToS correction | Product/legal | P0 | Copy |

**Exit criteria:** Demo can show ≥1 real proposal and/or treasury spend **or** a documented explanation with block range evidence; Console login works; privacy claim no longer false.

---

### Phase 1 — P0 engineering hardening (after Phase 0 data)

| Item | Status → Target | Complexity | Depends on |
|------|-----------------|------------|------------|
| Fix DOT/planck labeling | PARTIAL → IMPLEMENTED | M | None |
| Fix proposal detail href | PARTIAL → IMPLEMENTED | S | None |
| Complete event handlers / trim whitelist | PARTIAL → IMPLEMENTED | M | Fixtures |
| Treasury spend dedup | PARTIAL → IMPLEMENTED | M | Fixtures |
| Treasury API/UI filters | PROPOSED → IMPLEMENTED | S | None |
| Referendum→spend fields | PROPOSED → PARTIAL/IMPLEMENTED | L | Schema + fixtures |
| Proposal upsert / status merge | PARTIAL → IMPLEMENTED | M | Schema decision |
| Indexer metrics alerting | PARTIAL → OPS | M ops | Scrape stack |
| DLQ operator path | PARTIAL → IMPLEMENTED | M | Admin API optional |

**Exit criteria:** Dashboard storytelling matches ANALYSIS P0: visible governance + treasury with correct units; filters usable; known fixtures green in CI.

---

### Phase 2 — P1 Assurance depth (extend, don’t replace)

| Item | Approach | Complexity |
|------|----------|------------|
| Evidence upload + content hash + provenance | Extend `audit_evidence` | L |
| Compliance auto-ingest from spends | Extend compliance service | M |
| Report period/units/storage/auth | Fix `report_service` | M |
| Reviewer workflow polish | Extend cases UI | M |

**Exit criteria:** End-to-end audit case with verifiable evidence hash and chain refs; report units correct.

---

### Phase 3 — P1 Grants MVP (new domain, reused platform)

| Item | Approach | Complexity |
|------|----------|------------|
| `grants` + `milestones` tables/APIs/UI | New minimal domain on `projects` | L |
| Link milestones → audit evidence / treasury_spend | FKs | M |
| Overdue alerts | Reuse alert channels | S |

**Exit criteria:** Acceptance criteria in [AUDIT-AND-GRANTS-ASSESSMENT.md](./AUDIT-AND-GRANTS-ASSESSMENT.md) §B3.

---

### Phase 4 — Differentiation (later)

| Item | Notes |
|------|-------|
| Governance lifecycle intelligence (tracks, periods, deposits) | Large product module; after upsert baseline |
| Risk / anomaly detection | Needs clean historical series |
| AI copilot with citations | Replace `MockLLMProvider`; human review required |
| Cross-chain / Asset Hub | Parser research first |
| SSO / enterprise isolation | Deferred per DEVELOPMENT.md |

---

## Explicit non-goals (this roadmap)

- Rewriting FastAPI + Next.js Console SaaS for its own sake  
- Per-tenant private chain indexes (Enterprise later; document shared index honestly)  
- Razorpay Subscriptions API before payment-link lifecycle is live  
- Marketing every scaffold (AI/analytics) as production-complete  

---

## Dependency graph (simplified)

```text
Verify DB counts ──► Historical backfill ──► Demo credibility
         │                      │
         │                      ├──► Unit fixes (DOT, proposal_index)
         │                      ├──► Event handlers + dedup
         │                      └──► Spend linkage + filters
         │
         ├──► Console/SMTP/Razorpay/privacy (parallel ops)
         │
         └──► (after P0 demo) Evidence storage ──► Grants MVP
```

---

## Authorization gate

This package is **analysis only**.  

**Await authorization** before:

- Application code changes  
- Migrations  
- Production backfill / secret changes (ops may proceed under separate ops approval)  
- Commits / pushes of these docs (unless requested)

---

## Document index

1. [FEATURE-GAP-MATRIX.md](./FEATURE-GAP-MATRIX.md)  
2. [GOVERNANCE-INDEXER-ASSESSMENT.md](./GOVERNANCE-INDEXER-ASSESSMENT.md)  
3. [TREASURY-FUND-FLOW-ASSESSMENT.md](./TREASURY-FUND-FLOW-ASSESSMENT.md)  
4. [AUDIT-AND-GRANTS-ASSESSMENT.md](./AUDIT-AND-GRANTS-ASSESSMENT.md)  
5. [PRODUCTION-READINESS-GAPS.md](./PRODUCTION-READINESS-GAPS.md)  
6. [PRIORITIZED-DEVELOPMENT-ROADMAP.md](./PRIORITIZED-DEVELOPMENT-ROADMAP.md) *(this file)*
