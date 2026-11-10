# PolkAudit

**Governance transparency for Polkadot** — index on-chain activity, store audit-ready records, and serve them through a secure API, governance dashboard, and SaaS console.

PolkAudit helps communities, treasuries, and auditors see how Polkadot governance decides and spends. Substrate extrinsics become searchable records, KPIs, CSV/PDF exports, alerts, and billed workspaces.

| | |
|---|---|
| **Product status** | Production SaaS (Pro-ready features shipped; live Razorpay/SMTP are ops) |
| **License** | Apache 2.0 |
| **Stack** | Python indexer + FastAPI · PostgreSQL · Next.js |
| **Chain** | Polkadot (OpenGov + legacy democracy calls) |

**Live hosts**

| Surface | URL | Who uses it |
|---------|-----|-------------|
| Landing | [polkaudit.xyz](https://polkaudit.xyz) | Marketing & pricing |
| Governance dashboard | [app.polkaudit.xyz](https://app.polkaudit.xyz) | Teams viewing proposals / treasury (API key) |
| Console | [console.polkaudit.xyz](https://console.polkaudit.xyz) | Account, billing, keys, admin (invite-only login) |
| API | [api.polkaudit.xyz](https://api.polkaudit.xyz) | Same backend for app + console (`/docs`) |

---

## Table of contents

1. [In one minute](#in-one-minute)
2. [What each app does](#what-each-app-does)
3. [Architecture](#architecture)
4. [Repository structure](#repository-structure)
5. [Prerequisites](#prerequisites)
6. [Quick start (local)](#quick-start-local)
7. [Docker Compose](#docker-compose)
8. [Environment variables](#environment-variables)
9. [Running the stack](#running-the-stack)
10. [What you should see](#what-you-should-see)
11. [API overview](#api-overview)
12. [Plans & billing](#plans--billing)
13. [Database & migrations](#database--migrations)
14. [Production deploy](#production-deploy)
15. [Development & tests](#development--tests)
16. [Troubleshooting](#troubleshooting)
17. [Documentation index](#documentation-index)
18. [Security](#security)
19. [License & maintainer](#license--maintainer)

---

## In one minute

1. An **indexer** watches Polkadot finalized blocks and writes proposals, votes, treasury spends, and an audit trail into PostgreSQL.
2. A **backend API** reads that database and exposes stats, lists, exports, alerts, billing, and admin tools.
3. The **governance dashboard** (`apps/frontend`) is for day-to-day chain visibility — authenticate with `X-API-KEY`.
4. The **Console** (`apps/console`) is for SaaS account work — login with email/password (JWT). Create API keys, pay for plans, manage alerts, schedules, invoices, and (as admin) onboard tenants.

Console workspaces isolate **keys, alerts, billing, and membership**. Governance data for the relay MVP is a **shared Polkadot index** (not a private chain per tenant).

---

## What each app does

| Application | Path | Role |
|-------------|------|------|
| **Indexer** | `apps/indexer` | Async worker: RPC → decode extrinsics → PostgreSQL |
| **Backend** | `apps/backend` | FastAPI: governance APIs, auth, billing, jobs, OpenAPI |
| **Dashboard** | `apps/frontend` | Next.js governance UI (Overview, Proposals, Treasury, Exports) |
| **Console** | `apps/console` | Next.js SaaS / platform-admin UI |
| **Landing** | `apps/landing` | Marketing site (pricing in USD) |

> Older docs may say `apps/dashboard`. The canonical governance UI is **`apps/frontend`**.

### Indexed on-chain activity

| Category | Examples | Stored as |
|----------|----------|-----------|
| Proposals | `Referenda.submit`, `Democracy.propose` | `proposals` |
| Votes | `ConvictionVoting.vote`, `Democracy.vote` | `votes` |
| Treasury | `Treasury.spend` | `treasury_spends` |
| Audit trail | Decoded extrinsics | `extrinsics`, `blocks` |
| Indexer cursor | Last processed height | `processed_blocks` |
| Failures | Parse errors | `dead_letter_queue` |

Most blocks are routine (`Timestamp`, `ParaInherent`). **Blocks/extrinsics grow quickly; proposals may stay at zero until OpenGov activity appears** — that is normal.

### Product features (high level)

**Governance (dashboard + API)**

- Finalized-block indexing with OpenGov-aware parsing  
- Overview KPIs, proposals, treasury spends  
- CSV export (proposals / treasury) with plan entitlements  
- Prometheus metrics + health on the indexer  

**SaaS (console + API)**

- Invite-only Console (no public signup)  
- Projects / memberships / API keys with scopes (`read`, `export`, `alerts`)  
- USD plans + Razorpay payment links + webhook activation  
- Manual / DOT billing notes + PDF invoices  
- Usage metering (monthly API quotas + export counts)  
- Alerts, scheduled exports (runner + email), reports  
- Analytics / scoring, compliance, AI analysis, audit cases  
- Platform admin: onboard tenant, SMTP, payments log, DB query editor, chain sync  

Task board with live statuses: [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Polkadot RPC   │────▶│     Indexer      │────▶│   PostgreSQL    │
│  (WebSocket)    │     │  (async worker)  │     │  (shared DB)    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                            │
                     ┌──────────────────────────────────────┤
                     │                                      │
                     ▼                                      ▼
            ┌──────────────────┐                  ┌──────────────────┐
            │     Backend      │◀── X-API-KEY ───│   Dashboard      │
            │    (FastAPI)     │                  │  app.* (frontend)│
            └────────┬─────────┘                  └──────────────────┘
                     │
                     │ JWT + X-Project-ID
                     ▼
            ┌──────────────────┐
            │     Console      │
            │ console.*        │
            └──────────────────┘
```

**Data flow**

1. Indexer follows finalized heads and decodes extrinsics.  
2. Rows land in PostgreSQL (same DB URL as the backend).  
3. Backend serves `/api/v1/*`, `/api/auth/*`, `/api/admin/*`, `/api/jobs/*`.  
4. Dashboard calls the API with `X-API-KEY`.  
5. Console calls the API with `Authorization: Bearer <JWT>` and `X-Project-ID`.

**Schema ownership:** Backend **Alembic** migrations create/evolve tables. Run migrations **before** starting the indexer.

---

## Repository structure

```text
polkaudit/
├── apps/
│   ├── indexer/       # Blockchain ingestion worker (./run.sh — not uvicorn)
│   ├── backend/       # FastAPI + Alembic migrations
│   ├── frontend/      # Governance dashboard (app.polkaudit.xyz)
│   ├── console/       # SaaS console (console.polkaudit.xyz)
│   └── landing/       # Marketing site (polkaudit.xyz)
├── deploy/            # SAS / Oracle / nginx / systemd helpers
├── docs/              # Architecture, ops, treasury, hosting guides
├── DEVELOPMENT.md     # Living product task board
├── docker-compose.yml # Local full stack (optional)
└── README.md          # This file
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| **Python** | 3.11+ | Separate venv for indexer and backend |
| **Node.js** | 20+ | Frontend, console, landing |
| **PostgreSQL** | 15+ | Local Docker, Neon, or other hosted Postgres |
| **Git** | any | Clone this repository |

**Polkadot RPC:** `wss://rpc.polkadot.io` is fine for development. For production indexing, use a dedicated provider (OnFinality, Dwellir, etc.) to avoid rate limits.

---

## Quick start (local)

### 1. Clone

```bash
git clone https://github.com/PolkAudit/polkaudit.git
cd polkaudit
```

### 2. Database

Create a database (e.g. `polkaudit`) and note the URL:

```text
postgresql://postgres:postgres@localhost:5432/polkaudit
```

Neon / cloud URLs often look like `postgresql://...?sslmode=require`.

### 3. Backend `.env`

Create `apps/backend/.env` (or copy `.env.example`):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
API_KEY=dev-secret-key
SECRET_KEY=dev-jwt-secret
LOG_LEVEL=INFO
APP_PUBLIC_URL=http://localhost:3001
```

The backend normalizes to `postgresql+asyncpg://` and SSL for Neon automatically.

### 4. Migrations (required once)

```bash
cd apps/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
```

### 5. Indexer `.env`

Same database as backend:

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DATABASE
SUBSTRATE_RPC_URL=wss://rpc.polkadot.io
LOG_LEVEL=INFO
METRICS_PORT=8001
INDEXER_START_BLOCK=31387000
INDEXER_CATCHUP_WINDOW=2000
```

### 6. Dashboard (`apps/frontend`) `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
API_KEY=dev-secret-key
NEXT_PUBLIC_API_KEY=dev-secret-key
NEXT_PUBLIC_CONSOLE_URL=http://localhost:3001
```

### 7. Console `.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
cd apps/frontend && npm install
cd ../console && npm install
```

---

## Docker Compose

One command for Postgres + backend + indexer + dashboard (reviewer-friendly):

```bash
docker compose up --build
# or: make dev
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| Backend / docs | http://localhost:8000 · http://localhost:8000/docs |
| Indexer health | http://localhost:8001/health |

Default API key: `dev-secret-key` (change before production).

For Neon or an existing DB, prefer `./run.sh` per app with your own `.env` files.

---

## Environment variables

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL |
| `API_KEY` | Yes | Global demo key + fallback JWT secret |
| `SECRET_KEY` | Recommended | Dedicated JWT signing secret |
| `APP_PUBLIC_URL` | Yes (prod) | Console URL for magic links / checkout return |
| `API_PUBLIC_URL` | No | Public API base (default prod API host) |
| `SMTP_*` | No | Fallback mail; Console SMTP overrides when Host is set |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | No | Enables USD payment-link checkout |
| `RAZORPAY_WEBHOOK_SECRET` | No | Verifies `/api/v1/billing/webhook/razorpay` |
| `CRON_SECRET` | No | Auth for `/api/jobs/*/cron` |
| `ENABLE_SCHEDULE_WORKER` | No | In-process schedule + past_due poller (`true`/`false`) |
| `LOG_LEVEL` | No | Default `INFO` |

### Indexer (`apps/indexer/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same DB as backend |
| `SUBSTRATE_RPC_URL` | No | Default `wss://rpc.polkadot.io` |
| `METRICS_PORT` | No | Default `8001` |
| `INDEXER_START_BLOCK` | No | Jump cursor for faster demos |
| `INDEXER_CATCHUP_WINDOW` | No | On empty DB, start N blocks behind head |

### Frontend / Console

| App | Key vars |
|-----|----------|
| `apps/frontend` | `NEXT_PUBLIC_API_URL`, `API_KEY`, `NEXT_PUBLIC_API_KEY` |
| `apps/console` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |

**Never commit `.env` or `.env.local`.**

---

## Running the stack

Use **separate terminals**. Order matters for **data**, not for processes to start.

| Order | Service | Why |
|-------|---------|-----|
| 1 (once) | Migrations | Creates / upgrades tables |
| 2 | Indexer | Writes chain data |
| 3 | Backend | Serves API |
| 4 | Frontend | Governance UI (`:3000`) |
| 5 | Console | SaaS UI (`:3001`) |

### Indexer

```bash
cd apps/indexer
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
./run.sh
```

**Do not** run `uvicorn` here — this is an asyncio worker.

| Health | http://127.0.0.1:8001/health |
| Metrics | http://127.0.0.1:8001/metrics |

### Backend

```bash
cd apps/backend
source venv/bin/activate
./run.sh
```

| Health | http://127.0.0.1:8000/health |
| OpenAPI | http://127.0.0.1:8000/docs |

### Frontend (dashboard)

```bash
cd apps/frontend
npm run dev
```

→ http://localhost:3000

### Console

```bash
cd apps/console
npm run dev
```

→ http://localhost:3001  

Bootstrap admin is seeded by migration (`admin@polkaudit.xyz`). Public signup is disabled — create users via Console admin or `POST /api/admin/users`.

---

## What you should see

### Governance dashboard

| Screen | With indexer running | Notes |
|--------|----------------------|-------|
| Overview — blocks / extrinsics | Increasing | Pipeline is healthy |
| Proposals / votes / treasury | Often `0` at first | Waits for OpenGov activity |
| Exports | CSV / JSON | Subject to plan export caps |
| Settings | API key / Console link | Match key to backend |

```bash
curl -s -H "X-API-KEY: dev-secret-key" \
  http://127.0.0.1:8000/api/v1/stats/overview | python3 -m json.tool
```

If `total_blocks_indexed` and `total_extrinsics` grow, indexing works.

### Console

| Area | Purpose |
|------|---------|
| API keys | Create / revoke; choose scopes |
| Billing | Plans, checkout, manual notes, PDF invoices |
| Usage | Monthly API + export counters |
| Schedules | Recurring exports + **Run now** |
| Alerts / Reports / Analytics / Audit | Workspace tooling |
| Admin → Onboard tenant | Project + user + plan + key in one step |
| Admin → SMTP | Platform email (Zoho: port **465** SSL, STARTTLS off) |

---

## API overview

### Auth modes

| Client | Auth |
|--------|------|
| Dashboard / scripts | `X-API-KEY: pk_…` or global `API_KEY` |
| Console (user) | `Authorization: Bearer <JWT>` + `X-Project-ID` |
| Admin routes | JWT with `role=admin` |
| Cron jobs | `X-Cron-Secret: <CRON_SECRET>` |

API key **scopes** (project keys): `read` (MVP lists/stats), `export` (CSV), `alerts`. Global demo key has all scopes.

### Core governance

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/health` | No auth |
| `GET` | `/api/v1/stats/overview` | KPIs |
| `GET` | `/api/v1/proposals` | List |
| `GET` | `/api/v1/treasury/spends` | Treasury |
| `GET` | `/api/v1/export/proposals/csv` | CSV stream |
| `GET` | `/api/v1/export/treasury/csv` | CSV stream |

### SaaS / ops (selection)

| Area | Paths |
|------|-------|
| Auth | `/api/auth/token`, `/api/auth/me`, verify / reset |
| Keys | `/api/v1/keys/` |
| Billing | `/api/v1/billing/plans`, `checkout`, `subscription`, `invoices`, `webhook/razorpay` |
| Usage | `/api/v1/usage/summary` |
| Schedules | `/api/v1/schedules/` (+ `/{id}/run`) |
| Jobs | `/api/jobs/run-schedules`, `/api/jobs/sweep-subscriptions` |
| Admin | `/api/admin/tenants`, users, memberships, SMTP, `/api/admin/db` |

Interactive docs: http://127.0.0.1:8000/docs

---

## Plans & billing

List prices match landing midpoints (USD):

| Plan | Price | Interval |
|------|-------|----------|
| Free | $0 | — |
| Pilot | $1,000 | / 3 months |
| Starter | $149 | / month |
| Pro | $599 | / month |
| Enterprise | Custom | Contact sales |

Checkout uses **Razorpay payment links** (USD). Subscriptions get an `ends_at`; unpaid periods move to `past_due` then cancel after a **7-day grace** (job sweep). Formal **PDF invoices** are generated on payment or via Console → Billing → Generate invoice.

Without Razorpay keys, checkout returns **manual** mode (`hello@polkaudit.xyz`).

---

## Database & migrations

```bash
cd apps/backend
source venv/bin/activate
PYTHONPATH=. alembic upgrade head
PYTHONPATH=. alembic current
```

Current product migrations include usage counters, export schedules, invoices, API key scopes, and SMTP platform settings (see `apps/backend/migrations/versions/`).

Indexer and backend **must** share the same database.

---

## Production deploy

| Guide | Use when |
|-------|----------|
| [docs/ALIBABA_SAS_DEPLOY.md](docs/ALIBABA_SAS_DEPLOY.md) | Primary prod (API + console + dashboard on SAS) |
| [docs/PRODUCTION_OPS_CHECKLIST.md](docs/PRODUCTION_OPS_CHECKLIST.md) | Go-live checklist (secrets, Razorpay, SMTP) |
| [docs/HYBRID_DEPLOYMENT.md](docs/HYBRID_DEPLOYMENT.md) | Oracle indexer + GCP API/UI + Neon |
| [docs/GCP_CLOUD_BUILD.md](docs/GCP_CLOUD_BUILD.md) | Cloud Build → Cloud Run |

**After each deploy**

1. Confirm Alembic is at head (includes `f6a7b8c9d0e1` for Pro-ready tables).  
2. Set `SECRET_KEY`, `APP_PUBLIC_URL=https://console.polkaudit.xyz`.  
3. Console → SMTP → save → send test (Zoho: `smtppro.zoho.com`, port `465`, STARTTLS off).  
4. Add Razorpay USD keys + webhook → `https://api.polkaudit.xyz/api/v1/billing/webhook/razorpay`.  
5. Optionally `ENABLE_SCHEDULE_WORKER=true` or cron `POST /api/jobs/run-schedules/cron` with `X-Cron-Secret`.

Living status board: [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Development & tests

```bash
# Indexer
cd apps/indexer && source venv/bin/activate
PYTHONPATH=. pytest tests/ -v

# Backend
cd apps/backend && source venv/bin/activate
PYTHONPATH=. pytest tests/ -v

# Frontend / Console
cd apps/frontend && npm run build
cd apps/console && npm run build
```

```bash
make help    # optional fmt / lint / test helpers
```

---

## Troubleshooting

### `ModuleNotFoundError: asgi_correlation_id` (backend)

Use the backend venv and `./run.sh` — not system uvicorn.

### `ModuleNotFoundError: substrateinterface` (indexer)

Install **`substrate-interface`** (from `requirements.txt`), not the empty `substrateinterface` stub.

### Dashboard all zeros

Check `/api/v1/stats/overview`. Growing `total_blocks_indexed` / `total_extrinsics` means indexing works; proposals stay zero until OpenGov activity is scanned.

### Console SMTP send failed on Zoho port 465

Use **SSL on 465** (STARTTLS off). Port **587** uses STARTTLS. Prefer From address on the same mailbox domain as Username.

### `No API Key` in dashboard sidebar

Set `NEXT_PUBLIC_API_KEY` in `apps/frontend/.env.local`, restart `npm run dev`, hard-refresh.

### Indexer millions of blocks behind

Set `INDEXER_START_BLOCK` to a recent height, or use a fresh DB with `INDEXER_CATCHUP_WINDOW=2000`.

### Checkout stays Free after payment

Webhook may lag — wait and refresh Billing. Confirm Razorpay webhook secret and USD account. Check Admin → Payments.

---

## Documentation index

| Document | Description |
|----------|-------------|
| [MODULES_FEATURES.md](MODULES_FEATURES.md) | About PolkAudit + full modules & features map |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Product task board (what’s done / pending) |
| [docs/README.md](docs/README.md) | Docs hub |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) | Product summary |
| [docs/PolkAudit_NON_TECHNICAL_OVERVIEW.md](docs/PolkAudit_NON_TECHNICAL_OVERVIEW.md) | Non-technical explainer |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Demo walkthrough |
| [docs/PRODUCTION_OPS_CHECKLIST.md](docs/PRODUCTION_OPS_CHECKLIST.md) | Production go-live |
| [docs/SAAS_READINESS_GAP.md](docs/SAAS_READINESS_GAP.md) | SaaS readiness notes |
| [apps/console/README.md](apps/console/README.md) | Console module map |
| [apps/backend/README.md](apps/backend/README.md) | Backend details |
| [apps/indexer/README.md](apps/indexer/README.md) | Indexer details |
| [docs/ALIBABA_SAS_DEPLOY.md](docs/ALIBABA_SAS_DEPLOY.md) | SAS deploy |
| [docs/HYBRID_DEPLOYMENT.md](docs/HYBRID_DEPLOYMENT.md) | Oracle + GCP + Neon |
| [docs/TREASURY_PROPOSAL.md](docs/TREASURY_PROPOSAL.md) | Treasury Phase 1 proposal |

---

## Security

- Do not commit `.env`, credentials, or raw API keys.  
- Prefer a dedicated `SECRET_KEY` for JWT (do not reuse weak demo keys in prod).  
- Rotate `API_KEY` / project keys if exposed.  
- Restrict database network access.  
- Admin DB explorer is **read-only** (SELECT / EXPLAIN) — still admin-only.

---

## License & maintainer

**License:** Apache 2.0 — see [LICENSE](LICENSE).

**Maintainer:** Vijay — Founder, Value Creating Solutions  

For funding, partnership, or technical questions, open a GitHub issue or contact via your project channel.
