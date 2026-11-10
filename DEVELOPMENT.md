# PolkAudit — Development task board

**Last updated:** 2026-11-10 (Pro-ready: schedules runner, audit depth, invoices, key scopes, past_due)  
**Hosts:** Landing `polkaudit.xyz` · Dashboard `app.polkaudit.xyz` · Console `console.polkaudit.xyz` · API `api.polkaudit.xyz`

Status legend:

| Status | Meaning |
|--------|---------|
| **Complete** | Shipped in code / docs as intended |
| **Partial** | Works with known gaps or needs live config |
| **Pending** | Not started or blocked on ops/credentials |
| **Deferred** | Intentionally later |
| **N/A** | Out of scope by product design |

Related: [docs/PRODUCTION_OPS_CHECKLIST.md](docs/PRODUCTION_OPS_CHECKLIST.md) · [docs/SAAS_READINESS_GAP.md](docs/SAAS_READINESS_GAP.md)

---

## 1. Product split

| Task | Status | Notes |
|------|--------|-------|
| Landing site (`apps/landing`) | Complete | Pricing in USD ranges |
| Governance dashboard (`apps/frontend`) | Complete | Overview, Proposals, Treasury, Exports, Settings (API key) |
| Console SaaS / platform admin (`apps/console`) | Complete | Account + admin; not a governance fork |
| Shared FastAPI backend | Complete | Same API for app + console |
| Invite-only console (no public signup) | Complete | `POST /api/auth/register` → 403 |
| Auth redirects from frontend → console | Complete | signup / verify / forgot / reset |

---

## 2. Console — tenant & account modules

| Task | Route / API | Status | Notes |
|------|-------------|--------|-------|
| Home (account + projects summary) | `/` | Complete | |
| API keys CRUD + scopes | `/keys` | Complete | `read` / `export` / `alerts` |
| Billing (USD midpoints + checkout) | `/billing` | Partial | Code complete; needs Razorpay live keys |
| Payment success callback UX | `/billing` | Complete | Razorpay return + refresh |
| Tenant payment history | `/billing` | Complete | `GET /api/v1/billing/payments` |
| Manual / DOT billing notes | `/billing` | Complete | `POST /api/v1/billing/manual-note` |
| Invoice PDFs | `/billing` | Complete | Generate + download; also created on Razorpay paid |
| Usage dashboard | `/usage` | Complete | Monthly API + export counters |
| Analytics + scoring | `/analytics` | Complete | Trends / forecast / generate + scores |
| Scheduled exports + run now | `/schedules` | Complete | CRUD, notify email, runner + last_run |
| Reports | `/reports` | Complete | Generate / list / download |
| Integrations | `/integrations` | Complete | Plugins + test dispatch (admin) |
| Compliance | `/compliance` | Complete | Policies + violations UI |
| AI analysis | `/ai` | Complete | Analyze + recommendations (admin/auditor) |
| Audit cases (detail / evidence / comments) | `/audit` | Complete | Project-scoped; reopen supported |
| Alerts (channels / rules / history) | `/alerts` | Complete | |
| Settings (password, verify, connection) | `/settings` | Complete | |
| Login / forgot / reset / verify | `/login` etc. | Complete | |
| Project switcher | Sidebar | Complete | `polkaudit_project_id` |
| Change password | Settings + API | Complete | |

---

## 3. Console — platform admin

| Task | Route / API | Status | Notes |
|------|-------------|--------|-------|
| Onboard tenant (project+user+plan+key) | `/admin/tenants` | Complete | `POST /api/admin/tenants` |
| Tenant detail (plan/members/usage) | `/admin/tenants/[id]` | Complete | Linked from projects + onboard result |
| Memberships (user ↔ project) | `/admin/memberships` | Complete | |
| Users list / create | `/admin/users` | Complete | |
| Projects list / create | `/admin/projects` | Complete | Links to tenant detail |
| Platform billing (set plan) | `/admin/billing` | Complete | Project picker |
| Payment events log | `/admin/payments` | Complete | Webhook audit |
| SMTP settings + test send | `/admin/smtp` | Partial | Port 465 SSL fixed; needs live Zoho test |
| Seed bootstrap admin | Migration | Complete | `admin@polkaudit.xyz` |
| DB Query Editor (read-only) | `/admin/database` | Complete | SELECT/EXPLAIN + table browse |
| Chain sync trigger | `/admin/chains` | Complete | Background sync for project |

---

## 4. Billing & Razorpay

| Task | Status | Notes |
|------|--------|-------|
| Plans table + USD midpoints | Complete | Pilot $1000/3mo · Starter $149/mo · Pro $599/mo · Enterprise quote |
| Checkout payment links (USD) | Partial | Code uses USD; needs Razorpay account + keys |
| Webhook activate subscription | Partial | Code ready; needs webhook secret + URL on SAS |
| Admin set subscription | Complete | Sets `ends_at` from plan interval |
| Verified-email required for checkout | Complete | |
| Invoice PDFs | Complete | `invoices` table + fpdf2; webhook auto-create |
| DOT / manual invoice workflow in Console | Complete | Manual note + Generate invoice |
| Razorpay recurring Subscriptions API | Deferred | One-shot payment links; period via `ends_at` |
| `past_due` / grace / dunning | Complete | 7-day grace then cancel; job sweep |
| Usage dashboard | Complete | `/usage` + metering |
| Tenant detail page | Complete | `/admin/tenants/[id]` |

**List prices (locked midpoints from landing):**

| Plan | Amount | Interval | Checkout |
|------|--------|----------|----------|
| Free | $0 | — | N/A |
| Pilot | $1,000 | / 3 months | Yes |
| Starter | $149 | / month | Yes |
| Pro | $599 | / month | Yes |
| Enterprise | Custom | — | Contact sales |

---

## 5. Auth, security, entitlements

| Task | Status | Notes |
|------|--------|-------|
| JWT login | Complete | |
| Email verify / resend | Partial | Code + Console SMTP; delivery needs SMTP config |
| Forgot / reset password | Partial | Same as above |
| Dedicated `SECRET_KEY` for JWT | Partial | Supported; set on SAS (else falls back to `API_KEY`) |
| Per-project API keys (`pk_…`) | Complete | |
| Granular API key scopes | Complete | `read` / `export` / `alerts` enforced on MVP + export |
| Export daily caps by plan | Complete | |
| Plan RPM limits on MVP/export APIs | Complete | free 30 · starter 60 · pilot 120 · pro 300 · enterprise/demo 600 |
| Monthly API quotas (landing 5k / 100k) | Complete | Metered via `usage_counters` |
| Global demo `API_KEY` for dashboard | Complete | All scopes |
| Separate rate limit store (Redis) | Deferred | In-process counters on single SAS |

---

## 6. Multi-tenancy / data model

| Task | Status | Notes |
|------|--------|-------|
| `projects` / `user_projects` | Complete | |
| Workspace isolation (keys, alerts, billing) | Complete | |
| Shared Polkadot governance index | Complete | By design for relay MVP |
| Indexer writes `project_id` on all chain rows | Deferred / N/A | Shared chain read model |
| Per-tenant stats/proposals filter | Deferred | Not required for shared-index MVP |
| Dedicated deploy per enterprise tenant | Deferred | |

---

## 7. Frontend dashboard (`apps/frontend`)

| Task | Status | Notes |
|------|--------|-------|
| Overview / Proposals / Treasury / Exports | Complete | |
| Settings → Console for account/billing | Complete | |
| Alerts → deep-link Console when no JWT | Complete | |
| Stale INR / public register client removed | Complete | |
| Full JWT session in dashboard | N/A | Dashboard remains API-key first |

---

## 8. Deploy / production ops (SAS)

| Task | Status | Notes |
|------|--------|-------|
| GitHub Actions build + deploy dashboard + console | Complete | |
| Alembic on deploy | Complete | Through `f6a7b8c9d0e1` |
| Nginx / services for app, api, console | Complete | |
| Set `APP_PUBLIC_URL=https://console.polkaudit.xyz` | Pending | Confirm on server |
| Set Razorpay live keys (USD) | Pending | |
| Register Razorpay webhook | Pending | `…/api/v1/billing/webhook/razorpay` |
| Set `SECRET_KEY` in `backend.env` | Pending | Recommended |
| Configure SMTP (Console UI or env) + test | Pending | Zoho 465 SSL path fixed in code |
| Confirm migrations through `f6a7b8c9d0e1` on prod | Pending | After latest deploys |
| Optional `ENABLE_SCHEDULE_WORKER=true` or cron | Pending | `/api/jobs/run-schedules` + `CRON_SECRET` |
| GCP Cloud Run as secondary host for SaaS env | Partial | `cloudbuild.yaml` incomplete for Razorpay/SMTP |

---

## 9. Docs

| Task | Status | Notes |
|------|--------|-------|
| Console README (module map) | Complete | |
| PRODUCTION_OPS_CHECKLIST | Complete | |
| SAAS_READINESS_GAP refreshed | Complete | |
| This DEVELOPMENT.md task board | Complete | Living doc |

---

## 10. Landing / Pro-tier gaps

| Task | Status | Notes |
|------|--------|-------|
| Live Razorpay USD + webhook | Pending | Ops; code ready |
| Live SMTP delivery | Pending | Ops; Console UI ready |
| Governance analytics (Pro) | Complete | Console `/analytics` + scoring |
| Scheduled / automated exports (Pro) | Complete | Runner + notify email + Run now |
| Monthly API quota metering (5k / 100k) | Complete | See §5 |
| Formal invoices / receipts | Complete | PDF invoices |
| Governance Audit Snapshot productized flow | Partial | Audit cases + evidence UI; packaged service still sales-led |
| Custom chain / data work package | Deferred | Services offer, not self-serve product |
| Demo video on landing | Pending | Landing “coming soon” |

---

## 11. Advanced modules (API vs UI)

| Module | Backend API | Product UI | Status |
|--------|-------------|------------|--------|
| Integrations / plugins | Yes | `/integrations` | Complete |
| Compliance policies / violations | Yes | `/compliance` | Complete |
| Governance scoring | Yes | `/analytics` | Complete |
| Analytics (generate / trends / forecast) | Yes | `/analytics` | Complete |
| AI proposal analysis / recommendations | Yes | `/ai` | Complete |
| Audit cases / evidence / comments | Yes | `/audit` | Complete |
| Reports generation / download | Yes | `/reports` | Complete |
| Chain sync admin | Yes | `/admin/chains` | Complete |
| DB Query Editor | Yes | `/admin/database` | Complete |
| Jobs (schedules + past_due sweep) | Yes | Admin/cron HTTP | Complete |

---

## 12. Deferred / later roadmap

| Task | Status | Priority hint |
|------|--------|---------------|
| Self-serve signup → pay → provision | Deferred | After pilots |
| Razorpay recurring Subscriptions API | Deferred | Periods via `ends_at` for now |
| SSO / SAML | Deferred | Enterprise |
| Dedicated environment / SLA tooling | Deferred | Enterprise |
| True parachain / private index isolation | Deferred | Enterprise |
| Evidence object storage (S3) | Deferred | URL+hash today |
| Landing demo video | Pending | Marketing |

---

## Suggested next actions (human / ops)

1. Deploy + migrate to `f6a7b8c9d0e1`.
2. Console → **SMTP** → port 465, STARTTLS off → Save → Send test.
3. Add Razorpay USD keys + webhook on SAS.
4. Set `SECRET_KEY`, `APP_PUBLIC_URL`; optionally `ENABLE_SCHEDULE_WORKER=true` or cron `POST /api/jobs/run-schedules/cron` with `X-Cron-Secret`.
5. Smoke: Onboard → scoped API key → Schedules Run now → Billing Generate invoice.

When updating this file, change **Last updated** and flip statuses only.
