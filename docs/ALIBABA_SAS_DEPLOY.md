# Alibaba Cloud Simple Application Server — full stack

Host **landing**, **dashboard**, **API**, **indexer**, and **PostgreSQL** on one SAS instance. Deploy updates with **GitHub Actions** (Next.js built in CI; Python services updated over SSH).

```text
                    DNS
     polkaudit.xyz ─────────────┐
     app.polkaudit.xyz ─────────┤
     api.polkaudit.xyz ─────────┤
                                ▼
GitHub Actions                  nginx (SAS)
  build Next standalone ──scp──►├── :3001 landing
  SSH remote-deploy.sh          ├── :3000 frontend (dashboard)
                                ├── :8080 backend API
                                ├── indexer (systemd, no public port)
                                └── PostgreSQL 127.0.0.1
```

---

## RAM warning (2 GiB plan)

Running **two Next.js processes + FastAPI + indexer + Postgres** on **2 GiB** is tight.

Mitigations baked into setup:

- Next apps built in **GitHub Actions** (not on the VM)
- `output: 'standalone'` + memory caps on systemd units
- **2G swapfile** created by `setup-sas.sh`
- Indexer tip-window + nightly prune

If you see OOM kills, upgrade SAS to **4 GiB**.

---

## One-time bootstrap (manual)

On the SAS instance (SSH as **root** is normal on Alibaba — the script creates a `polkaudit` service user):

```bash
cd /tmp
rm -rf polkaudit
git clone --branch main https://github.com/PolkAudit/polkaudit.git
cd polkaudit
# already root on SAS:
bash deploy/alibaba/setup-sas.sh --skip-clone --install-dir /opt/polkaudit
# or: sudo bash deploy/alibaba/setup-sas.sh --skip-clone --install-dir /opt/polkaudit
```

This installs Postgres, API, indexer, nginx host routing, Node 20 runtime, swap, env files, and prune cron.  
**UI processes start after the first successful GitHub Actions deploy** (standalone artifacts).

Verify API:

```bash
curl -s http://127.0.0.1:8080/health
sudo systemctl status polkaudit-backend polkaudit-indexer
```

---

## GitHub Actions (autonomous full-stack CD)

### Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `SAS_HOST` | Yes | SAS public IP |
| `SAS_USER` | Yes | Often `root` on Alibaba SAS (root-only login) |
| `SAS_SSH_KEY` | Yes | Private key for SSH |
| `SAS_PORT` | No | Default 22 |
| `NEXT_PUBLIC_API_KEY` | Recommended | Baked into dashboard build + match backend `API_KEY` |

App processes run as a dedicated **`polkaudit`** Linux user created by `setup-sas.sh` — not as root — even when you SSH as root.

Optional overrides: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DASHBOARD_URL`, …

### What the workflow does

1. **Build** `apps/frontend` + `apps/landing` (standalone) on `ubuntu-latest`  
2. Upload tarballs as artifacts  
3. **SCP** to `/tmp/polkaudit-artifacts/` on SAS  
4. Run `remote-deploy.sh`: git sync → pip → alembic → unpack UI → restart all services → health checks  

Triggers: push to `main` touching backend/indexer/frontend/landing/deploy/alibaba, or **workflow_dispatch**.

---

## DNS

Point these **A** records at the SAS public IP:

| Host | App | Public? |
|------|-----|---------|
| `app.polkaudit.xyz` | Dashboard `:3000` | **Yes** |
| `api.polkaudit.xyz` | API `:8080` | **Yes** (browser clients need it) |
| `polkaudit.xyz` / `www` | Landing `:3001` | Optional but recommended |
| `indexer.polkaudit.xyz` | — | **No** — do not expose; indexer is a local systemd worker only |

Indexer talks to Postgres + chain RPC on the box (`127.0.0.1`). API for **SSR** also uses localhost via `INTERNAL_API_URL=http://127.0.0.1:8080/api/v1` in `frontend.env`; the public `api.` hostname is still required for the browser.

Then TLS (skip landing domains if you are not using them yet):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.polkaudit.xyz -d api.polkaudit.xyz
# optional landing:
# sudo certbot --nginx -d polkaudit.xyz -d www.polkaudit.xyz
```

You can **remove Vercel** projects once DNS/TLS are confirmed (or keep Vercel as backup until cutover).

---

## Files

| Path | Purpose |
|------|---------|
| `deploy/alibaba/setup-sas.sh` | One-time full-stack bootstrap |
| `deploy/alibaba/remote-deploy.sh` | CD entrypoint |
| `deploy/alibaba/pack-next-standalone.sh` | CI pack helper |
| `deploy/alibaba/nginx-polkaudit.conf` | Host-based routing |
| `deploy/alibaba/polkaudit-*.service` | systemd units |
| `deploy/alibaba/prune-old-blocks.sh` | Disk retention |
| `.github/workflows/deploy-alibaba-sas.yml` | Build UI + SSH deploy |

---

## Cutover checklist

1. Finish `setup-sas.sh` on SAS  
2. Add `SAS_*` (+ `NEXT_PUBLIC_API_KEY`) GitHub secrets  
3. Push this full-stack deploy config to `main` / run workflow  
4. Confirm `curl` to `:3000` / `:3001` / `:8080` on the server  
5. Move DNS from Vercel → SAS IP  
6. Certbot  
7. Disable or pause Vercel projects when stable  
8. Stop Cloud Run indexer/backend if they share the same DB (one writer only)
