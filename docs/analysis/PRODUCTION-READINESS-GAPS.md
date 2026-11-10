# Production Readiness Gaps (Separate from Feature Depth)

**Status classifications:** `IMPLEMENTED | PARTIAL | OPS_BLOCKED | PROPOSED | NEEDS_VERIFICATION`  
**Scope:** Repository verification only (2026-11-10). Aligns with ANALYSIS.md §6 without prescribing SaaS rebuilds.

---

## 1. Console production availability

| ID | Capability | Status | Files | Evidence | Missing | Approach | Deps | Priority | Acceptance | Tests | Complexity |
|----|------------|--------|-------|----------|---------|----------|------|----------|------------|-------|------------|
| O-01 | Deploy path Console on SAS | IMPLEMENTED | `.github/workflows/deploy-alibaba-sas.yml`, `deploy/alibaba/remote-deploy.sh`, `polkaudit-console.service`, `nginx-polkaudit.conf` | Build/SCP/restart `:3001`; nginx `console.polkaudit.xyz` | Live uptime proof | Ops health check + cert SAN | GH secrets | P0 | HTTPS login page 200 | Deploy script curls local :3001 | M |
| O-02 | Live Console reachable | NEEDS_VERIFICATION | ANALYSIS.md inspection note | One upstream error observed externally | Continuous probe | Synthetic monitor; systemd/nginx/cert review | — | P0 | Public console loads | Manual/synthetic | S ops |
| O-05 | TLS covers console host | PARTIAL | `remote-deploy.sh` certbot fallback | Fallback may omit console SAN | Guaranteed SAN | Explicit certbot for app+api+console | Let's Encrypt | P1 | Valid cert for console | Manual | S |

**Conclusion:** Architecture for Console is adequate. Treat outages as **ops**, not a reason to rebuild Console.

---

## 2. Privacy and legal content

| ID | Capability | Status | Files | Evidence | Missing | Approach | Priority | Acceptance | Complexity | Type |
|----|------------|--------|-------|----------|---------|----------|----------|------------|------------|------|
| O-03 | Accurate privacy claim | PARTIAL | `apps/landing/components/security.tsx` | Claims no private user info stored | Honest SaaS disclosure | Copy update | P0 | Landing lists email/accounts/billing | S | **Confirmed defect** |
| O-04 | Privacy/ToS pages | PARTIAL | landing footer → GitHub docs | No dedicated policy URLs | Legal pages | Publish + link | P0 | Footer → real policies | S | Confirmed gap |
| P-04/05 | Actual PII/billing storage | IMPLEMENTED | `models/user.py`, `billing.py` | Email, password hash, payment_events JSON | Retention/erasure policy text | Document; optional product later | P1 | Policy ↔ schema | — | Fact |

Internal docs (`ARCHITECTURE.md`, etc.) may repeat “public chain only” — align with SaaS reality.

---

## 3. Razorpay and SMTP

| ID | Capability | Status | Files | Evidence | Missing | Approach | Priority | Acceptance | Complexity |
|----|------------|--------|-------|----------|---------|----------|----------|------------|------------|
| O-05 code | Payment links + webhook | IMPLEMENTED | `razorpay_service.py`, `billing.py` webhook | Signature verify; subscription activate; invoices hook | Live keys | SAS env + Razorpay dashboard | P0 | Checkout mode razorpay; webhook events in admin | M ops |
| O-06 | Live Razorpay secrets | OPS_BLOCKED | PRODUCTION_OPS_CHECKLIST | Placeholders | Credentials | Ops only | P0 | Paid plan activates | S |
| SMTP code | Mailer + Console SMTP | IMPLEMENTED | `mailer.py`, `/admin/smtp` | DB override; 465 SSL fix shipped | Deliverability | Configure Zoho; test send | P0 | Verify email arrives | M ops |
| SMTP live | Delivery | OPS_BLOCKED | — | Logs when host unset | Provider config | Ops | P0 | — | S |
| Recurring Razorpay | Subscriptions API | PROPOSED | SAAS_READINESS_GAP | Links + ends_at only | Recurring | Defer | P2 | — | L |

**Do not** rewrite billing modules; configure and smoke-test.

---

## 4. Monitoring, alerting, recovery

| ID | Capability | Status | Files | Evidence | Missing | Approach | Priority | Complexity |
|----|------------|--------|-------|----------|---------|----------|----------|------------|
| M-01 | Indexer /health + Prometheus | IMPLEMENTED | `apps/indexer/src/server.py` | Metrics on METRICS_PORT | External scrape/alerts | Scrape localhost:8001; alert on lag/failures | P0 | M ops |
| M-02 | API /health depth | PARTIAL | `main.py` | Status ok only | DB/indexer lag surface | Optional enrich later | P1 | M |
| M-03 | DLQ visibility | PARTIAL | scanner → `dead_letter_queue` | Rows written | Admin UI / alerts | SQL via admin DB or dedicated endpoint | P0 | M |
| M-04 | Tenant alert cron | PARTIAL | `POST /alerts/trigger` | Manual only | Scheduled runner | Reuse jobs/cron pattern | P1 | M |
| M-05 | Reindex runbooks | IMPLEMENTED | `reindex-range.sh` | Documented | Execution | Ops | P0 | S ops |

---

## 5. API security and tenant isolation

| ID | Capability | Status | Files | Evidence | Missing | Approach | Priority | Complexity |
|----|------------|--------|-------|----------|---------|----------|----------|------------|
| S-01 | JWT + project membership | IMPLEMENTED | `dependencies.py` | Non-members blocked; admin bypass | Project-role granularity | Harden later | P1 | M |
| S-02 | API key scopes | IMPLEMENTED | `auth.py`, keys API | read/export/alerts | Global demo key all-scopes | Rotate prod demo key | P0 | S ops |
| S-04 | Chain data isolation | PARTIAL | stats/proposals queries | Shared Polkadot index by design | Per-tenant index | Document; Enterprise later | P1 honesty | — |
| S-05 | Admin DB explorer | IMPLEMENTED | `admin_db.py` | App-level RO SQL | RO DB role | Ops credentials | P0 | M ops |
| S-07 | CORS `*` + credentials | PARTIAL | `main.py` | Permissive | Tighten origins | Env allowlist | P1 | S |

---

## 6. Analytics, compliance, AI scaffolds

| ID | Module | Status | Evidence | Guidance |
|----|--------|--------|----------|----------|
| A-01 | Analytics/forecast | PARTIAL | `analytics_service.py` | Keep; improve when scores have data |
| A-02 | Scoring | PARTIAL | Heuristic formulas | Keep; not P0 |
| A-03 | Compliance | PARTIAL | Manual ingest | Extend in P1 audit track |
| A-04 | AI | PARTIAL | `MockLLMProvider` | Do not market as production LLM; P2+ |
| A-06 | Entitlements | IMPLEMENTED | export caps, RPM, quotas | Preserve |

**Explicit:** No evidence that SaaS Console/billing/auth architecture is inadequate. Gaps are **depth, data, ops, and copy**.

---

## 7. ANALYSIS.md checklist crosswalk

| Checklist item | Repo status |
|----------------|-------------|
| Verify indexer completeness vs historical events | NEEDS_VERIFICATION + OPS scripts ready |
| Console deployment / recovery | IMPLEMENTED path; live NEEDS_VERIFICATION |
| Tenant isolation on tenant-scoped endpoints | IMPLEMENTED for workspace features |
| Restrict admin SQL explorer | PARTIAL (app RO; DB role TBD) |
| Evidence retention / tamper controls | PARTIAL→PROPOSED (audit P1) |
| Freshness / lag / DLQ monitoring | PARTIAL |
| Accurate privacy/terms | PARTIAL (copy) |
| Billing webhooks + email | IMPLEMENTED + OPS_BLOCKED |
| Demo dataset / backfill | OPS_BLOCKED until executed |
| Pen test | NEEDS_VERIFICATION (external) |

---

## 8. Ops-first actions (no feature rebuild)

1. Probe Console HTTPS + cert SAN.  
2. Run `scripts/check-governance-data.sh` / SQL counts on prod DB.  
3. Backfill via `reindex-range.sh` if counts are zero.  
4. Set Razorpay + SMTP; test checkout and verify email.  
5. Fix landing privacy/legal copy.  
6. Scrape indexer metrics; alert on `BLOCKS_FAILED` / lag.  
7. Use RO DB credentials for admin explorer if feasible.
