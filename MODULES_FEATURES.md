# PolkAudit — Modules & Features

A single reference for **what PolkAudit is**, **who it is for**, and **what each module does**.

| | |
|---|---|
| **Product** | PolkAudit |
| **Focus** | Polkadot governance & treasury transparency |
| **License** | Apache 2.0 |
| **Live** | [polkaudit.xyz](https://polkaudit.xyz) · [app.polkaudit.xyz](https://app.polkaudit.xyz) · [console.polkaudit.xyz](https://console.polkaudit.xyz) · [api.polkaudit.xyz](https://api.polkaudit.xyz) |

Related: [README.md](README.md) · [DEVELOPMENT.md](DEVELOPMENT.md) · [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md)

---

## Table of contents

1. [About PolkAudit](#about-polkaudit)
2. [Who it is for](#who-it-is-for)
3. [How the product is split](#how-the-product-is-split)
4. [Modules & features](#modules--features)
5. [Plans & entitlements](#plans--entitlements)
6. [Technical building blocks](#technical-building-blocks)
7. [What is intentionally out of scope (for now)](#what-is-intentionally-out-of-scope-for-now)

---

## About PolkAudit

### The problem

Polkadot governance and treasury activity lives on-chain as Substrate extrinsics — accurate, but hard for humans to read. Community members, treasury teams, auditors, and partners often need answers like:

- What proposals are open or decided?
- Who voted, and with what conviction?
- Where did treasury funds go?
- Can we export an audit-ready trail for a period?
- Can our team get keys, alerts, and billing without sharing one shared secret forever?

Spreadsheets and ad-hoc explorers do not scale into a product teams can run day to day.

### The product

**PolkAudit** turns Polkadot finalized-block activity into:

1. A **searchable governance index** (proposals, votes, treasury spends, extrinsics).  
2. A **governance dashboard** for day-to-day visibility.  
3. A **SaaS Console** for accounts, API keys, billing, usage, alerts, schedules, reports, and admin.  
4. A **secure API** that both UIs (and integrations) call.

In short: **index → store → serve → operate**.

### Design principles

| Principle | Meaning |
|-----------|---------|
| **Transparency first** | Prefer verifiable chain-derived records over narrative-only reporting. |
| **Two UIs, one API** | Dashboard = governance; Console = account & platform. Same backend. |
| **Invite-only Console** | No public self-serve signup; operators provision tenants. |
| **Shared relay index (MVP)** | Workspaces isolate keys/billing/alerts; chain read model is shared Polkadot for the relay MVP. |
| **Entitlements** | Plans gate export caps, RPM, monthly API quotas, and Pro tooling. |
| **Ops honesty** | Code can be Pro-ready while live payments/email still need provider keys. |

### What “good” looks like in practice

- Indexer is catching finalized blocks; blocks/extrinsics KPIs climb.  
- Dashboard shows overview, proposals, treasury, and exports with a project API key.  
- Console lets a tenant manage keys (with scopes), pay or record billing, see usage, schedule exports, and configure alerts.  
- Admins can onboard a tenant in one flow, configure SMTP, inspect payments, and (read-only) explore the DB.

---

## Who it is for

| Audience | How they use PolkAudit |
|----------|------------------------|
| **Treasury / DAO operators** | Dashboard for spend & proposals; Console for keys, billing, alerts, scheduled exports |
| **Auditors & reviewers** | Exports, reports, audit cases + evidence, compliance views |
| **Community & delegates** | Clear proposal/treasury visibility without raw chain tooling |
| **Platform operators (PolkAudit admin)** | Onboard tenants, set plans, SMTP, payments log, chain sync, DB explorer |
| **Integrators** | REST API with scoped API keys |

---

## How the product is split

```text
polkaudit.xyz          →  Landing (marketing & pricing)
app.polkaudit.xyz      →  Governance dashboard  (API key)
console.polkaudit.xyz  →  SaaS Console          (JWT login)
api.polkaudit.xyz      →  Shared FastAPI backend
         ▲
         │
   PostgreSQL  ←  Indexer (Polkadot RPC)
```

| Surface | App path | Auth | Primary job |
|---------|----------|------|-------------|
| **Landing** | `apps/landing` | Public | Explain product & USD pricing |
| **Dashboard** | `apps/frontend` | `X-API-KEY` | View governance & export CSVs |
| **Console** | `apps/console` | Email/password JWT + project | Account, billing, admin |
| **API** | `apps/backend` | API key and/or JWT | All product logic |
| **Indexer** | `apps/indexer` | N/A (worker) | Ingest chain → database |

---

## Modules & features

Modules below are grouped by **where users find them**. Features list what the module actually does today.

---

### A. Chain ingestion (Indexer)

**Purpose:** Continuously read Polkadot finalized blocks and write structured rows.

| Feature | Description |
|---------|-------------|
| Finalized-block catch-up | Follows chain head; configurable start height / catch-up window |
| OpenGov-aware parsing | Decodes referenda / democracy / conviction voting / treasury spends |
| Full extrinsic trail | Stores blocks + extrinsics for audit context |
| Indexer cursor | `processed_blocks` tracks progress |
| Dead-letter handling | Failed blocks recorded for investigation |
| Health & metrics | HTTP health + Prometheus metrics port |

**Not a user-facing UI** — operators run it as a systemd/Docker worker.

---

### B. Governance dashboard (`app.polkaudit.xyz`)

**Purpose:** Day-to-day governance visibility for a workspace using an API key.

| Module | Route (typical) | Features |
|--------|-----------------|----------|
| **Overview** | `/` | KPIs: blocks indexed, extrinsics, proposals, votes, treasury aggregates |
| **Proposals** | `/proposals` | List + detail views of indexed proposals |
| **Treasury** | `/treasury` | Treasury spend list / values from chain data |
| **Exports** | `/exports` | Download CSV / overview JSON (subject to plan export limits) |
| **Alerts** | `/alerts` | Deep-link / redirect toward Console when JWT account tooling is needed |
| **Settings** | `/settings` | API connection, link to Console for account/billing |

**Auth:** `X-API-KEY` (global demo key or per-project `pk_…` key).

---

### C. Console — account modules (`console.polkaudit.xyz`)

**Purpose:** Everything about the **tenant workspace** that is not the governance board itself.

| Module | Route | Features |
|--------|-------|----------|
| **Home** | `/` | Account summary, projects, shortcut to open dashboard |
| **API keys** | `/keys` | Create / list / revoke keys; scopes `read`, `export`, `alerts`; raw secret shown once |
| **Billing** | `/billing` | USD plans, Razorpay checkout, payment callback UX, manual/DOT notes, PDF invoices, payment event ledger, period / past_due status |
| **Usage** | `/usage` | Monthly API call count vs plan quota; export call count |
| **Analytics** | `/analytics` | Generate metrics, trends, forecast; governance scores |
| **Schedules** | `/schedules` | Create daily/weekly/monthly export jobs; notify email; toggle; **Run now**; last run status |
| **Reports** | `/reports` | Generate / list / download compliance-style PDF reports |
| **Alerts** | `/alerts` | Notification channels, rules, alert history |
| **Integrations** | `/integrations` | Plugin list + test dispatch (admin-oriented) |
| **Compliance** | `/compliance` | Create policies; list violations |
| **AI** | `/ai` | Queue proposal analysis; view recommendations (admin/auditor) |
| **Audit** | `/audit` | Cases list/create; detail with evidence URLs + hash, comments, close/reopen (admin/auditor) |
| **Settings** | `/settings` | Password change, email verify/resend, connection info |
| **Auth pages** | `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | Invite-only login lifecycle (public register disabled) |
| **Project switcher** | Sidebar | Select active `X-Project-ID` workspace |

---

### D. Console — platform admin

**Purpose:** PolkAudit operators provision and support tenants.

| Module | Route | Features |
|--------|-------|----------|
| **Onboard tenant** | `/admin/tenants` | One-shot: project + user + plan + API key; link to tenant detail |
| **Tenant detail** | `/admin/tenants/[id]` | Members + usage snapshot + deep links |
| **Memberships** | `/admin/memberships` | Attach users to projects with roles |
| **Users** | `/admin/users` | List / create users (invite path) |
| **Projects** | `/admin/projects` | List / create projects; open tenant detail |
| **Platform billing** | `/admin/billing` | Manually set a project’s plan |
| **Payments** | `/admin/payments` | Razorpay webhook event audit log |
| **SMTP** | `/admin/smtp` | Platform email host/port/user/from; STARTTLS vs SSL (465); test send; DB overrides env |
| **Database** | `/admin/database` | Read-only SQL explorer (SELECT/EXPLAIN) + table browse |
| **Chain sync** | `/admin/chains` | Trigger background proposal sync for a project |

---

### E. Backend API modules

**Purpose:** Single FastAPI service powering dashboard + console + integrations.

| Module area | Examples | Features |
|-------------|----------|----------|
| **Governance read API** | `/api/v1/stats`, `proposals`, `treasury`, `activity` | Authenticated reads; plan RPM + monthly quota metering |
| **Exports** | `/api/v1/export/...` | CSV streams; daily export entitlements; `export` scope |
| **Auth** | `/api/auth/*` | JWT login, me, projects, verify, reset, change password |
| **API keys** | `/api/v1/keys` | CRUD + scopes |
| **Billing** | `/api/v1/billing/*` | Plans, checkout, subscription, manual note, payments, invoices PDF, Razorpay webhook |
| **Usage** | `/api/v1/usage/summary` | Period counters + quota remaining |
| **Schedules** | `/api/v1/schedules` | CRUD, toggle, run-now |
| **Jobs** | `/api/jobs/*` | Due schedule runner; subscription past_due / grace sweep; cron secret or admin JWT |
| **Alerts** | `/api/v1/alerts` | Channels, rules, history |
| **Reports** | `/api/v1/reports` | Generate / download PDFs |
| **Analytics / scoring** | `/api/v1/analytics`, `/api/v1/scores` | Trends, forecast, score calculate |
| **AI** | `/api/v1/ai` | Proposal analyze queue + recommendations |
| **Compliance** | `/api/v1/compliance` | Policies & violations |
| **Audit** | `/api/v1/audit` | Cases, evidence, comments, close/reopen (project-scoped) |
| **Integrations** | `/api/v1/integrations` | Plugins / dispatch |
| **Admin** | `/api/admin/*` | Users, tenants, memberships, SMTP |
| **Admin DB** | `/api/admin/db` | Read-only explorer |
| **Chains** | `/api/v1/chains` | Sync triggers |
| **Public** | `/api/public` | Limited public routes as configured |
| **Health / docs** | `/health`, `/docs` | Liveness + OpenAPI |

---

### F. Landing (`polkaudit.xyz`)

| Feature | Description |
|---------|-------------|
| Product story | Positioning for treasuries / transparency |
| Pricing | USD midpoints aligned with Console checkout |
| CTAs | Path into app / contact / console as configured |

---

## Plans & entitlements

### List prices (USD midpoints)

| Plan | Price | Interval | Checkout |
|------|-------|----------|----------|
| Free | $0 | — | Default workspace |
| Pilot | $1,000 | / 3 months | Razorpay payment link |
| Starter | $149 | / month | Razorpay payment link |
| Pro | $599 | / month | Razorpay payment link |
| Enterprise | Custom | Quote | Contact sales |

### What plans control (product behavior)

| Control | Behavior |
|---------|----------|
| **Export daily caps** | Per-plan daily export limits |
| **API RPM** | Requests/minute by plan (e.g. free 30 → pro 300 → enterprise/demo 600) |
| **Monthly API quotas** | e.g. starter ~5k, pro ~100k (enterprise unlimited) |
| **Period end** | `ends_at` set from plan interval; then `past_due` → grace → cancel |
| **Invoices** | PDF receipts on paid webhook or manual generate |

Without Razorpay keys configured, checkout falls back to **manual** contact mode. Console still supports manual/DOT billing notes.

---

## Technical building blocks

| Building block | Role |
|----------------|------|
| **PostgreSQL** | Shared system of record (chain index + SaaS tables) |
| **Alembic** | Schema migrations owned by backend |
| **API keys** | `pk_…` hashed at rest; scopes enforced on routes |
| **JWT** | Console sessions; prefer dedicated `SECRET_KEY` |
| **SMTP** | Verify / reset / schedule emails (Console settings or env) |
| **Razorpay** | USD payment links + webhook activation |
| **Schedule worker** | In-process (`ENABLE_SCHEDULE_WORKER`) or HTTP cron + `CRON_SECRET` |
| **fpdf2** | Governance reports + billing invoice PDFs |

---

## What is intentionally out of scope (for now)

These are known **deferred** or **ops-only** items — not missing “mystery” modules:

| Item | Notes |
|------|-------|
| Live Razorpay / SMTP credentials | Ops on production hosts |
| Razorpay recurring Subscriptions API | One-shot links + `ends_at` lifecycle today |
| Public self-serve signup → pay → provision | Invite / admin onboard only |
| Per-tenant private chain indexes | Shared Polkadot index for relay MVP |
| SSO / SAML | Enterprise later |
| Evidence object storage (S3) | Evidence is URL + content hash today |
| Landing demo video | Marketing asset |

Track status in [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Quick module map (cheat sheet)

| If you want to… | Go to |
|-----------------|-------|
| See proposals / treasury | **Dashboard** → Proposals / Treasury |
| Download CSV | **Dashboard** → Exports (or scheduled via Console) |
| Create an API key | **Console** → API keys |
| Pay or invoice | **Console** → Billing |
| See quota usage | **Console** → Usage |
| Email recurring exports | **Console** → Schedules |
| Provision a customer | **Console** → Onboard tenant (admin) |
| Fix platform email | **Console** → SMTP (admin) |
| Inspect API contracts | **API** → `/docs` |

---

*This document describes the product as shipped in the monorepo. For setup and deploy steps, start with [README.md](README.md).*
