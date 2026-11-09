# Alibaba Cloud Simple Application Server — app stack

Host **dashboard**, **console**, **API**, **indexer**, and **PostgreSQL** on one SAS instance.  
**Landing** (`polkaudit.xyz`) stays on **Vercel**.

Deploy updates with **GitHub Actions** (dashboard + console built in CI; Python services updated over SSH).

```text
                    DNS
     polkaudit.xyz ───────────► Vercel (landing)
     app.polkaudit.xyz ───────┐
     console.polkaudit.xyz ───┤
     api.polkaudit.xyz ───────┤
                              ▼
GitHub Actions                nginx (SAS)
  build UI ──scp─────────────►├── :3000 frontend (dashboard)
  SSH remote-deploy.sh        ├── :3001 console (account/billing)
                              ├── :8080 backend API
                              ├── indexer (systemd, localhost only)
                              └── PostgreSQL 127.0.0.1
```

---

## RAM warning (2 GiB plan)

Running **two Next.js apps + FastAPI + indexer + Postgres** on **2 GiB** is tight (landing on Vercel helps).

Mitigations baked into setup:

- Dashboard + console built in **GitHub Actions** (not on the VM)
- `output: 'standalone'` + memory caps (`frontend` 512M, `console` 384M)
- **2G swapfile** created by `setup-sas.sh`
- Indexer tip-window + nightly prune

If you see OOM kills, upgrade SAS to **4 GiB**, or move console to Vercel later.

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

1. **Build** `apps/frontend` + `apps/console` (standalone) on `ubuntu-latest`  
2. Upload tarballs as artifacts  
3. **SCP** to `/tmp/polkaudit-artifacts/` on SAS  
4. Run `remote-deploy.sh`: git sync → pip → alembic → unpack UIs → restart API/indexer/frontend/console  

Triggers: push to `main` touching backend/indexer/frontend/console/deploy/alibaba, or **workflow_dispatch**.

Landing deploys separately via Vercel (connected to `apps/landing`).

---

## DNS

| Host | Target |
|------|--------|
| `polkaudit.xyz` / `www` | **Vercel** (landing) |
| `app.polkaudit.xyz` | SAS IP → dashboard `:3000` |
| `console.polkaudit.xyz` | SAS IP → console `:3001` |
| `api.polkaudit.xyz` | SAS IP → API `:8080` |
| `indexer.polkaudit.xyz` | **Do not use** — indexer is local only |

SSR on dashboard/console uses `INTERNAL_API_URL=http://127.0.0.1:8080/api/v1`; browsers use `https://api.polkaudit.xyz`.

TLS on SAS:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
# first time (or after adding console DNS):
sudo certbot --nginx -d app.polkaudit.xyz -d api.polkaudit.xyz -d console.polkaudit.xyz
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
| `deploy/alibaba/reindex-range.sh` | Re-scan blocks for OpenGov/treasury catch-up |
| `.github/workflows/deploy-alibaba-sas.yml` | Build dashboard + SSH deploy |

### Re-index a governance-rich range

If the dashboard shows blocks but **0 proposals/votes/treasury**, re-scan from a known height (does not wipe the whole DB):

```bash
# as root on SAS — example start block; pick from Subscan / recent tip minus N
bash /opt/polkaudit/deploy/alibaba/reindex-range.sh 28000000
journalctl -u polkaudit-indexer -f
# look for: Found governance proposals=… votes=… spends=…
```

---

## Optional SaaS env (`/etc/polkaudit/backend.env`)

Email verification / password reset and Razorpay pilots are optional. Until set, magic links are logged via `journalctl -u polkaudit-backend`, and **Upgrade** in Settings returns a manual contact fallback.

| Key | Purpose |
|-----|---------|
| `APP_PUBLIC_URL` | Base for magic links (default `https://console.polkaudit.xyz`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Send verify + reset emails |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Create Payment Links for Pilot / Pro |
| `RAZORPAY_WEBHOOK_SECRET` | Verify `POST /api/v1/billing/webhook/razorpay` |

Webhook URL to register in Razorpay: `https://api.polkaudit.xyz/api/v1/billing/webhook/razorpay` (events: `payment_link.paid`, `payment.captured`).

Console runs on SAS (`polkaudit-console`, `:3001`). Create `/etc/polkaudit/console.env` from `deploy/alibaba/console.env.example` if missing (setup-sas does this). DNS: `console.polkaudit.xyz` A/AAAA → SAS IP (same as app/api).

See `deploy/alibaba/backend.env.example` — never commit real secrets.

---

## Cutover checklist

1. Finish `setup-sas.sh` on SAS  
2. Add `SAS_*` (+ `NEXT_PUBLIC_API_KEY`) GitHub secrets  
3. Run workflow **Deploy Alibaba SAS**  
4. Confirm `curl` to `:3000` / `:8080` on the server  
5. DNS: `app` + `api` + `console` → SAS; apex/`www` on Vercel  
6. Certbot for `app` + `api` + `console`  
7. Keep Vercel for landing only  
8. Stop Cloud Run indexer/backend if they share the same DB (one writer only)
9. (Optional) Add `SMTP_*` / `RAZORPAY_*` to `/etc/polkaudit/backend.env` and `systemctl restart polkaudit-backend`
10. Set `APP_PUBLIC_URL=https://console.polkaudit.xyz` in `/etc/polkaudit/backend.env` after console DNS/TLS is live
