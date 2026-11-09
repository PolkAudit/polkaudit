# Alibaba Cloud Simple Application Server — app stack

Host **dashboard**, **API**, **indexer**, and **PostgreSQL** on one SAS instance.  
**Landing** (`polkaudit.xyz`) stays on **Vercel**.

Deploy updates with **GitHub Actions** (dashboard built in CI; Python services updated over SSH).

```text
                    DNS
     polkaudit.xyz ───────────► Vercel (landing)
     app.polkaudit.xyz ───────┐
     api.polkaudit.xyz ───────┤
                              ▼
GitHub Actions                nginx (SAS)
  build dashboard ──scp──────►├── :3000 frontend (dashboard)
  SSH remote-deploy.sh        ├── :8080 backend API
                              ├── indexer (systemd, localhost only)
                              └── PostgreSQL 127.0.0.1
```

---

## RAM warning (2 GiB plan)

Running **Next.js dashboard + FastAPI + indexer + Postgres** on **2 GiB** is tight (landing on Vercel helps).

Mitigations baked into setup:

- Dashboard built in **GitHub Actions** (not on the VM)
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
bash deploy/alibaba/setup-sas.sh --skip-clone --install-dir /opt/polkaudit
```

This installs Postgres, API, indexer, nginx (app + api), Node 20 runtime, swap, env files, and prune cron.  
**Dashboard starts after the first successful GitHub Actions deploy.**

Verify API:

```bash
curl -s http://127.0.0.1:8080/health
systemctl status polkaudit-backend polkaudit-indexer
```

---

## GitHub Actions (SAS CD)

### Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `SAS_HOST` | Yes | SAS public IP |
| `SAS_USER` | Yes | Often `root` on Alibaba SAS (root-only login) |
| `SAS_SSH_KEY` | Yes | Private key for SSH |
| `SAS_PORT` | No | Default 22 |
| `NEXT_PUBLIC_API_KEY` | Recommended | Baked into dashboard build + match backend `API_KEY` |

App processes run as a dedicated **`polkaudit`** Linux user created by `setup-sas.sh` — not as root — even when you SSH as root.

### What the workflow does

1. **Build** `apps/frontend` (standalone) on `ubuntu-latest`  
2. Upload tarball as artifact  
3. **SCP** to `/tmp/polkaudit-artifacts/` on SAS  
4. Run `remote-deploy.sh`: git sync → pip → alembic → unpack dashboard → restart API/indexer/frontend  

Triggers: push to `main` touching backend/indexer/frontend/deploy/alibaba, or **workflow_dispatch**.

Landing deploys separately via Vercel (connected to `apps/landing`).

---

## DNS

| Host | Target |
|------|--------|
| `polkaudit.xyz` / `www` | **Vercel** (landing) |
| `app.polkaudit.xyz` | SAS IP → dashboard `:3000` |
| `api.polkaudit.xyz` | SAS IP → API `:8080` |
| `indexer.polkaudit.xyz` | **Do not use** — indexer is local only |

SSR on the dashboard uses `INTERNAL_API_URL=http://127.0.0.1:8080/api/v1`; browsers use `https://api.polkaudit.xyz`.

TLS on SAS:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.polkaudit.xyz -d api.polkaudit.xyz
```

---

## Files

| Path | Purpose |
|------|---------|
| `deploy/alibaba/setup-sas.sh` | One-time bootstrap |
| `deploy/alibaba/remote-deploy.sh` | CD entrypoint |
| `deploy/alibaba/pack-next-standalone.sh` | CI pack helper |
| `deploy/alibaba/nginx-polkaudit.conf` | app + api routing |
| `deploy/alibaba/polkaudit-*.service` | systemd units |
| `deploy/alibaba/prune-old-blocks.sh` | Disk retention |
| `.github/workflows/deploy-alibaba-sas.yml` | Build dashboard + SSH deploy |

---

## Cutover checklist

1. Finish `setup-sas.sh` on SAS  
2. Add `SAS_*` (+ `NEXT_PUBLIC_API_KEY`) GitHub secrets  
3. Run workflow **Deploy Alibaba SAS**  
4. Confirm `curl` to `:3000` / `:8080` on the server  
5. DNS: `app` + `api` → SAS; apex/`www` stay on Vercel  
6. Certbot for `app` + `api`  
7. Keep Vercel for landing only  
8. Stop Cloud Run indexer/backend if they share the same DB (one writer only)
