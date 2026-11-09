# PolkAudit

**Enterprise-grade governance transparency for Polkadot** — index on-chain activity, store audit-ready records, and present them through a secure API and dashboard.

PolkAudit helps communities, investors, and auditors understand how Polkadot DAOs make decisions and spend treasury funds. Complex Substrate extrinsics become searchable records, KPIs, and exports.

| | |
|---|---|
| **Status** | MVP (active development) |
| **License** | Apache 2.0 |
| **Stack** | Python (indexer + API) · PostgreSQL · Next.js |
| **Target chain** | Polkadot (OpenGov + legacy democracy calls) |

---

## Table of contents

1. [What PolkAudit does](#what-PolkAudit-does)
2. [Architecture](#architecture)
3. [Repository structure](#repository-structure)
4. [Prerequisites](#prerequisites)
5. [Quick start (local development)](#quick-start-local-development)
6. [Environment variables](#environment-variables)
7. [Running the stack](#running-the-stack)
8. [What you should see in the UI](#what-you-should-see-in-the-ui)
9. [API overview](#api-overview)
10. [Database & migrations](#database--migrations)
11. [Development & tests](#development--tests)
12. [Troubleshooting](#troubleshooting)
13. [Documentation index](#documentation-index)
14. [Roadmap & funding readiness](#roadmap--funding-readiness)
15. [Maintainer](#maintainer)

---

## What PolkAudit does

PolkAudit is an **open-source monorepo** with three runnable applications:

| Application | Role |
|-------------|------|
| **Indexer** | Connects to a Polkadot RPC node, scans finalized blocks, decodes extrinsics, and writes governance/treasury/indexer tables to PostgreSQL. |
| **Backend** | FastAPI service that reads PostgreSQL and exposes authenticated REST APIs, CSV export, and OpenAPI docs. |
| **Dashboard** | Next.js portal for overview KPIs, proposals, treasury, exports, and settings. |

### Indexed on-chain activity (MVP)

| Category | Substrate modules (examples) | Stored as |
|----------|------------------------------|-----------|
| Proposals | `Referenda.submit`, `Democracy.propose` | `proposals` |
| Votes | `ConvictionVoting.vote`, `Democracy.vote` | `votes` |
| Treasury | `Treasury.spend` | `treasury_spends` |
| Audit trail | All decoded extrinsics | `extrinsics`, `blocks` |
| Indexer state | Processed block pointer | `processed_blocks` |
| Failures | Parse/runtime errors per block | `dead_letter_queue` |

Most blocks contain only routine calls (e.g. `Timestamp`, `ParaInherent`). **Blocks and extrinsics counts will grow steadily; proposals/votes may stay at zero until OpenGov activity appears in scanned blocks** — that is expected.

### Key features

- Real-time finalized-block indexing
- Governance and treasury extraction (OpenGov-aware parser)
- REST API with API-key authentication
- Web dashboard (Overview, Proposals, Treasury, Exports, Settings)
- CSV export for proposals
- JSON overview export
- Prometheus metrics and health endpoints on the indexer
- Alembic migrations (schema owned by backend)

---

## Architecture

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Polkadot RPC   │────▶│     Indexer      │────▶│   PostgreSQL    │◀────│     Backend      │
│  (WebSocket)    │     │  (async worker)  │     │  (shared DB)    │     │    (FastAPI)     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘     └────────┬─────────┘
                                                            │                       │
                                                            │                       │ HTTP + X-API-KEY
                                                            │                       ▼
                                                            │              ┌──────────────────┐
                                                            │              │    Dashboard     │
                                                            │              │    (Next.js)     │
                                                            └──────────────│                  │
                                                                           └──────────────────┘
```

**Data flow**

1. Indexer reads `chain_getFinalizedHead` / `chain_getBlock` from RPC.
2. Extrinsics are decoded with `substrate-interface` and classified (governance vs generic).
3. Rows are committed to PostgreSQL (same database URL as backend).
4. Backend serves aggregated stats and lists via `/api/v1/*`.
5. Dashboard calls the backend (server-side and client-side) with `X-API-KEY`.

**Schema ownership:** Backend **Alembic** migrations create and evolve tables. The indexer **does not** run `create_all` in production flow — it expects migrations to have been applied first.

---

## Repository structure

```text
polkaudit/
├── apps/
│   ├── indexer/          # Blockchain ingestion worker (NOT uvicorn — use ./run.sh)
│   │   ├── src/
│   │   │   ├── main.py       # Entry: asyncio worker + metrics server
│   │   │   ├── scanner.py    # Finalized block catch-up loop
│   │   │   ├── parser.py     # OpenGov / democracy / treasury decoding
│   │   │   └── ...
│   │   ├── requirements.txt
│   │   ├── run.sh
│   │   └── README.md
│   ├── backend/          # FastAPI API (use ./run.sh from apps/backend)
│   │   ├── src/
│   │   ├── migrations/       # Alembic — run before indexer
│   │   ├── requirements.txt
│   │   ├── run.sh
│   │   └── README.md
│   └── dashboard/        # Next.js 14+ App Router UI
│       ├── app/
│       ├── lib/api.ts
│       ├── .env.local
│       └── package.json
├── docs/                 # Product, architecture, funding, setup guides
├── Makefile              # fmt/lint/test helpers (optional)
└── README.md             # This file
```

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|--------|
| **Python** | 3.11+ | Separate venv per `apps/indexer` and `apps/backend` |
| **Node.js** | 20+ | For dashboard |
| **PostgreSQL** | 15+ | Local Docker, Neon, or other hosted Postgres |
| **Git** | any | Clone this repository |

**Polkadot RPC:** Public endpoint `wss://rpc.polkadot.io` works for development. For production indexing, use a dedicated provider (OnFinality, Dwellir, etc.) to avoid rate limits.

---

## Quick start (local development)

### 1. Clone and enter the repo

```bash
git clone <your-repo-url> polkaudit
cd polkaudit
```

### 2. Create PostgreSQL database

Create a database (e.g. `polkaudit`) and note the connection URL.  
Example local URL:

```text
postgresql://postgres:postgres@localhost:5432/polkaudit
```

For **Neon** or other cloud Postgres, use the connection string from your provider (often `postgresql://...?sslmode=require`).

### 3. Configure backend environment

Create `apps/backend/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
API_KEY=dev-secret-key
LOG_LEVEL=INFO
```

Use your real credentials. The backend automatically converts this to `postgresql+asyncpg://` and applies SSL settings for Neon.

### 4. Run database migrations (required once)

```bash
cd apps/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. alembic upgrade head
```

### 5. Configure indexer environment

Create `apps/indexer/.env` (same `DATABASE_URL` as backend, async driver is fine):

```env
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DATABASE
SUBSTRATE_RPC_URL=wss://rpc.polkadot.io
LOG_LEVEL=INFO
METRICS_PORT=8001

# Optional: jump to recent Polkadot height for faster demos (recommended)
INDEXER_START_BLOCK=31387000
INDEXER_CATCHUP_WINDOW=2000
```

If `INDEXER_START_BLOCK` is unset and the DB has no processed blocks, the indexer starts **2000 blocks behind** chain head. If the DB already has a lower `last_processed`, set `INDEXER_START_BLOCK` to skip ahead.

### 6. Configure dashboard environment

Create `apps/dashboard/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
API_KEY=dev-secret-key
NEXT_PUBLIC_API_KEY=dev-secret-key
```

`API_KEY` must match `apps/backend/.env`. `NEXT_PUBLIC_API_KEY` is required for the browser sidebar status badge.

### 7. Install dashboard dependencies

```bash
cd apps/dashboard
npm install
```

Copy example env files (optional):

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/indexer/.env.example apps/indexer/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
# Edit DATABASE_URL and API_KEY as needed
```

---

## Hybrid deployment (recommended): Oracle + GCP + Neon

**Free-friendly production layout:**

| Layer | Platform |
|-------|----------|
| Indexer | **Oracle Cloud** Always Free VM |
| API + Dashboard | **GCP Cloud Run** (Cloud Build) |
| Database | **Neon** PostgreSQL |

**Start here:** [docs/HYBRID_DEPLOYMENT.md](docs/HYBRID_DEPLOYMENT.md)

```bash
# 1) GCP — backend + dashboard only (no paid always-on indexer)
gcloud builds submit --config=cloudbuild.backend-dashboard.yaml \
  --substitutions=_REGION=us-central1,_API_KEY=your-api-key

# 2) Oracle VM — indexer (SSH to VM)
sudo bash deploy/oracle/setup-indexer.sh
sudo nano /etc/polkaudit/indexer.env
sudo systemctl restart polkaudit-indexer

# 3) Verify from laptop
export BACKEND_URL=https://your-backend.run.app
export API_KEY=your-api-key
./scripts/hybrid-verify.sh
```

Env reference: [env.hybrid.example](env.hybrid.example)

---

## GCP Cloud Build → Cloud Run

- **Backend Service:** `cloudbuild.yaml`
- **Indexer Worker Pool:** `cloudbuild.indexer-worker-pool.yaml` (separate trigger)

See **[docs/GCP_CLOUD_BUILD.md](docs/GCP_CLOUD_BUILD.md)**.

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_AR_REPO=apps

gcloud builds submit --config=cloudbuild.indexer-worker-pool.yaml \
  --substitutions=_REGION=us-central1,_AR_REPO=apps
```

Dashboard UI stays on Vercel (`apps/frontend`).
---

## Docker Compose (one command)

Runs **Postgres + backend + indexer + dashboard** for reviewers without manual venv setup.

```bash
# From repo root
docker compose up --build
# or
make dev
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| Backend API / docs | http://localhost:8000 · http://localhost:8000/docs |
| Indexer health | http://localhost:8001/health |

Default API key: `dev-secret-key` (change before production).

**Notes:**

- First indexer run catches up ~500 blocks behind chain head (`INDEXER_CATCHUP_WINDOW` in compose).
- For **Neon** or existing data, keep using `./run.sh` per app with your `.env` files instead of compose Postgres.
- Verify pipeline: `make verify-e2e`

---

## Environment variables

### Backend (`apps/backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL URL (`postgresql://` or `postgresql+asyncpg://`) |
| `API_KEY` | Yes | Secret for `X-API-KEY` header on protected routes |
| `LOG_LEVEL` | No | Default `INFO` |

### Indexer (`apps/indexer/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same database as backend |
| `SUBSTRATE_RPC_URL` | No | Default `wss://rpc.polkadot.io` |
| `LOG_LEVEL` | No | Default `INFO` |
| `METRICS_PORT` | No | Health/metrics HTTP port (default `8001`) |
| `RETRY_DELAY_SECONDS` | No | Pause when caught up (default `2`) |
| `INDEXER_START_BLOCK` | No | If DB is behind this height, jump here (demo) |
| `INDEXER_CATCHUP_WINDOW` | No | On empty DB, start N blocks behind head (default `2000`) |

### Dashboard (`apps/dashboard/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | No | Default `http://localhost:8000/api/v1` |
| `API_KEY` | Yes | Used by server components |
| `NEXT_PUBLIC_API_KEY` | Yes | Used by client components / sidebar |

**Never commit `.env` or `.env.local` to Git.**

---

## Running the stack

Use **three terminals**. Order matters for **data in the UI**, not for services to start.

| Order | Service | Why |
|-------|---------|-----|
| 1 (once) | Migrations | Creates tables |
| 2 | Indexer | Writes chain data |
| 3 | Backend | Serves API |
| 4 | Dashboard | UI |

### Terminal 1 — Indexer

```bash
cd apps/indexer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./run.sh
```

**Do not** run `uvicorn` here — the indexer is an asyncio worker, not FastAPI.

**Healthy logs look like:**

```json
{"event": "Database connection verified", ...}
{"event": "Successfully committed block", "extrinsics_added": 2, "governance_added": 0, ...}
```

| Endpoint | URL |
|----------|-----|
| Health | http://127.0.0.1:8001/health |
| Metrics | http://127.0.0.1:8001/metrics |

### Terminal 2 — Backend

```bash
cd apps/backend
source venv/bin/activate
pip install -r requirements.txt
./run.sh
```

**Do not** run bare `uvicorn` from the repo root — use `./run.sh` from `apps/backend` so the correct venv and `PYTHONPATH` are used.

| Endpoint | URL |
|----------|-----|
| Health | http://127.0.0.1:8000/health |
| OpenAPI | http://127.0.0.1:8000/docs |
| Stats | http://127.0.0.1:8000/api/v1/stats/overview (requires `X-API-KEY`) |

### Terminal 3 — Dashboard

```bash
cd apps/dashboard
npm run dev
```

| URL | http://localhost:3000 |

Restart `npm run dev` after changing `.env.local`.

---

## What you should see in the UI

| Screen | With indexer running | Notes |
|--------|----------------------|-------|
| **Overview — Blocks / Extrinsics** | Increasing numbers | Proof indexing works |
| **Overview — Proposals / Votes / Treasury** | Often `0` at first | Only non-zero when governance extrinsics are found |
| **Proposals / Treasury tables** | May be empty | Same as above |
| **Exports — Proposals CSV** | Header only if no proposals | Normal for quiet chain windows |
| **Exports — Overview JSON** | Includes blocks, extrinsics, last block | Use to verify pipeline |
| **Settings** | API key status + connection test | Match `dev-secret-key` to backend |

Verify from terminal:

```bash
make verify-e2e
# or:
curl -s -H "X-API-KEY: dev-secret-key" http://127.0.0.1:8000/api/v1/stats/overview | python3 -m json.tool
```

Demo screenshots: see [docs/assets/README.md](docs/assets/README.md).

Example healthy response (values will vary):

```json
{
  "total_proposals": 0,
  "total_votes": 0,
  "total_treasury_spend": "0",
  "total_blocks_indexed": 120,
  "total_extrinsics": 240,
  "last_indexed_block": 31387150
}
```

If `total_blocks_indexed` and `total_extrinsics` grow, the system is working.

---

## API overview

Protected routes require header:

```http
X-API-KEY: <your API_KEY from backend .env>
```

### Core MVP endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Backend liveness (no API key) |
| `GET` | `/api/v1/stats/overview` | KPIs including indexing stats |
| `GET` | `/api/v1/proposals` | List proposals |
| `GET` | `/api/v1/proposals/{index}` | Single proposal |
| `GET` | `/api/v1/treasury/spends` | Treasury spend list |
| `GET` | `/api/v1/export/proposals/csv` | Stream proposals CSV |

Additional routers exist for reports, alerts, scoring, AI, compliance, etc. — many are **Phase 2+** scaffolding; treat MVP scope as stats + proposals + treasury + export.

Full interactive docs: http://127.0.0.1:8000/docs

---

## Database & migrations

- **Tool:** Alembic (`apps/backend/migrations/`)
- **Run from:** `apps/backend` with `PYTHONPATH=.`

```bash
cd apps/backend
source venv/bin/activate
PYTHONPATH=. alembic upgrade head
PYTHONPATH=. alembic current    # verify revision
```

### Main tables (MVP)

| Table | Purpose |
|-------|---------|
| `blocks` | Indexed block metadata |
| `extrinsics` | Decoded calls (audit trail) |
| `processed_blocks` | Indexer cursor |
| `proposals` | Governance proposals |
| `votes` | Votes |
| `treasury_spends` | Treasury payouts |
| `dead_letter_queue` | Failed block processing |

Indexer and backend share one database. Both apps must use the same `DATABASE_URL` (asyncpg form for runtime).

---

## Development & tests

### Indexer tests

```bash
cd apps/indexer
source venv/bin/activate
pip install pytest pytest-asyncio
PYTHONPATH=. pytest tests/ -v
```

### Backend tests

```bash
cd apps/backend
source venv/bin/activate
pip install pytest pytest-asyncio
PYTHONPATH=. pytest tests/ -v
```

### Dashboard

```bash
cd apps/dashboard
npm run build
npm run lint
```

### Makefile (repo root)

```bash
make help    # format, lint, test targets (optional)
```

---

## Troubleshooting

### `ModuleNotFoundError: No module named 'asgi_correlation_id'` (backend)

**Cause:** Running system `uvicorn` instead of backend venv.

**Fix:**

```bash
cd apps/backend
source venv/bin/activate
pip install -r requirements.txt
./run.sh
```

### `ModuleNotFoundError: No module named 'substrateinterface'` (indexer)

**Cause:** Wrong PyPI package. Install **`substrate-interface`** (hyphen), not `substrateinterface` (stub).

**Fix:**

```bash
cd apps/indexer
pip uninstall -y substrateinterface
pip install -r requirements.txt
```

### Indexer logs show `extrinsics_added: 0` always

**Cause:** Broken `substrateinterface` 1.0.0 stub was installed (decode fails silently).

**Fix:** Same as above — reinstall from `requirements.txt` and restart `./run.sh`. You should see `extrinsics_added: 2` (or similar) per block.

### Dashboard shows all zeros; exports empty

**Cause:** UI KPIs for proposals/votes/treasury are empty because `governance_added: 0` in most blocks.

**Check:** Stats API for `total_blocks_indexed` and `total_extrinsics`. If those grow, indexing works. Wait for blocks with OpenGov activity or index a longer range.

### `No API Key` badge in sidebar

**Fix:** Add `NEXT_PUBLIC_API_KEY=dev-secret-key` to `apps/dashboard/.env.local`, restart `npm run dev`, hard-refresh browser. Or use Settings → enable custom key → Save.

### Backend reload loops / watch errors on `venv/`

**Fix:** Use `./run.sh` only (excludes `venv/` from reload). Do not run uvicorn manually with reload watching the whole app folder.

### Indexer very slow / millions of blocks behind

**Fix:** Set `INDEXER_START_BLOCK` in `apps/indexer/.env` to a recent Polkadot block height, or use fresh DB + `INDEXER_CATCHUP_WINDOW=2000`.

### Neon / SSL connection errors

Backend and indexer normalize URLs and pass `ssl=require` for `neon.tech` hosts. Use full connection string in `.env`; remove duplicate `channel_binding` issues by using the apps' built-in URL normalization.

---

## Documentation index

**Treasury voters:** start at [docs/README.md](docs/README.md)

| Document | Description |
|----------|-------------|
| [docs/README.md](docs/README.md) | Documentation hub |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [docs/SETUP.md](docs/SETUP.md) | Setup guide (see also this README) |
| [docs/PRODUCT_OVERVIEW.md](docs/PRODUCT_OVERVIEW.md) | Product summary |
| [docs/PolkAudit_NON_TECHNICAL_OVERVIEW.md](docs/PolkAudit_NON_TECHNICAL_OVERVIEW.md) | Non-technical explainer |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Demo walkthrough (3–5 min) |
| [docs/WEEKLY_REPORT.md](docs/WEEKLY_REPORT.md) | Weekly progress report |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Product roadmap |
| [apps/indexer/README.md](apps/indexer/README.md) | Indexer setup, env, troubleshooting |
| [apps/backend/README.md](apps/backend/README.md) | Backend API, migrations, troubleshooting |
| [apps/frontend/](apps/frontend/) | Dashboard UI (canonical; replaces `apps/dashboard` for new work) |
| [apps/console/](apps/console/) | SaaS account UI (`console.polkaudit.xyz` on SAS — auth, billing, API keys) |
| [docs/HYBRID_DEPLOYMENT.md](docs/HYBRID_DEPLOYMENT.md) | **Oracle indexer + GCP API/UI + Neon** |
| [docs/GCP_CLOUD_BUILD.md](docs/GCP_CLOUD_BUILD.md) | Cloud Build trigger + Cloud Run deploy |
| [docs/ALIBABA_SAS_DEPLOY.md](docs/ALIBABA_SAS_DEPLOY.md) | Alibaba SAS API/indexer + GitHub Actions CD |
| [docs/INDEXER_FREE_HOSTING.md](docs/INDEXER_FREE_HOSTING.md) | Free VM hosting (Oracle or GCP e2-micro) |
| [docs/DEMO_HOSTING_GUIDE.md](docs/DEMO_HOSTING_GUIDE.md) | Public demo hosting and discussion launch checklist |
| [docs/PUBLIC_PRIVATE_REPO_GUIDE.md](docs/PUBLIC_PRIVATE_REPO_GUIDE.md) | Public vs private file guide before opening the repo |
| [docs/TREASURY_PROPOSAL.md](docs/TREASURY_PROPOSAL.md) | Polkadot Treasury Phase 1 proposal (~$10k DOT, 8 weeks) |
| [docs/TREASURY_SUMMARY.md](docs/TREASURY_SUMMARY.md) | One-page treasury overview for voters |
| [docs/TREASURY_SUBMISSION_CHECKLIST.md](docs/TREASURY_SUBMISSION_CHECKLIST.md) | Treasury pre-submit checklist |
| [docs/TREASURY_REVIEWER_FAQ.md](docs/TREASURY_REVIEWER_FAQ.md) | Treasury voter Q&A |
| [docs/POLKASSEMBLY_DISCUSSION_POST.md](docs/POLKASSEMBLY_DISCUSSION_POST.md) | Legacy Polkassembly discussion draft (archived) |
| [docs/POLKADOT_FORUM_POST.md](docs/POLKADOT_FORUM_POST.md) | Polkadot Forum governance topic draft |
| [deploy/oracle/README.md](deploy/oracle/README.md) | Oracle VM setup script + systemd |
| [docs/assets/README.md](docs/assets/README.md) | Screenshot & export capture guide |

---

## Roadmap & funding readiness

**Current phase:** MVP — prove live Polkadot indexing, API, dashboard, and exports.

**Near-term milestones:**

1. End-to-end demo with screenshots and JSON/CSV exports  
2. Push code to GitHub with CI  
3. Public demo + Polkassembly discussion + demo video  
4. ~~`docker-compose` for one-command reviewer setup~~ — `docker compose up` + `make dev` available  

See [docs/TREASURY_SUBMISSION_CHECKLIST.md](docs/TREASURY_SUBMISSION_CHECKLIST.md) for the full checklist.

---

## Security notes

- Rotate API keys and database passwords if they were ever shared or committed.  
- Do not commit `.env`, `.env.local`, or credentials.  
- Use strong `API_KEY` in production.  
- Restrict database network access (Neon IP allowlist, etc.).

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

## Maintainer

**Vijay** — Founder, Value Creating Solutions

For funding, partnership, or technical questions, open an issue or contact the maintainer through your project channel.
