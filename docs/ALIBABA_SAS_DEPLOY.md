# Alibaba Cloud Simple Application Server — API + Indexer + local Postgres

Run PolkAudit **backend** and **indexer** on one [Simple Application Server](https://www.alibabacloud.com/product/simple-application-server) (SAS) instance with **PostgreSQL on the same VM**, and deploy updates autonomously with **GitHub Actions**.

Dashboard / landing stay on **Vercel**.

```text
GitHub Actions (push to main)
        │ SSH
        ▼
Alibaba SAS (Ubuntu)
  nginx → FastAPI (polkaudit-backend)
  systemd → indexer (polkaudit-indexer)
  PostgreSQL (local)
  cron → prune-old-blocks.sh
```

---

## Why this works for CI/CD

| Concern | Approach |
|---------|----------|
| Autonomous deploys | GitHub Action SSHs in and runs `remote-deploy.sh` |
| Secrets | Live only on the server (`/etc/polkaudit/*.env`) — **not** in the workflow |
| Indexer disk growth | Nightly prune keeps last N blocks |
| Process crashes | `systemd` `Restart=always` |
| Schema changes | `alembic upgrade head` on every deploy |

---

## One-time: create the SAS instance

1. Alibaba Cloud Console → **Simple Application Server** → create Ubuntu 22.04+  
2. Size (MVP): **2 vCPU / 4 GB RAM / ≥ 40 GB SSD** (80 GB safer)  
3. Open firewall ports: **22** (SSH), **80** (HTTP), **443** (HTTPS later)  
4. Note the **public IP**

SSH in:

```bash
ssh ubuntu@YOUR_SAS_IP
```

---

## One-time: bootstrap the server

```bash
# On the SAS instance
git clone --branch main https://github.com/ViSa-Innovations/polkaudit.git /tmp/polkaudit
sudo bash /tmp/polkaudit/deploy/alibaba/setup-sas.sh --skip-clone --install-dir /opt/polkaudit
# Or let the script clone:
# sudo bash /tmp/polkaudit/deploy/alibaba/setup-sas.sh
```

What setup does:

- Installs Python, nginx, PostgreSQL  
- Creates DB user/database  
- Writes `/etc/polkaudit/backend.env` and `indexer.env`  
- Creates venvs, runs Alembic  
- Enables `polkaudit-backend` + `polkaudit-indexer` systemd units  
- Configures nginx → `:8080`  
- Installs nightly prune cron (`RETAIN_BLOCKS=100000`)

Verify:

```bash
curl -s http://127.0.0.1/health
sudo systemctl status polkaudit-backend polkaudit-indexer
sudo journalctl -u polkaudit-indexer -f
```

Set a tip-relative start (after truncate if needed):

```bash
sudo nano /etc/polkaudit/indexer.env
# INDEXER_START_BLOCK=<tip-2000>
# INDEXER_CATCHUP_WINDOW=500
sudo systemctl restart polkaudit-indexer
```

---

## GitHub Actions (autonomous deploy)

### 1. SSH key for Actions

On your laptop:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/polkaudit_sas_deploy -N ""
```

On the SAS instance:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'PASTE_PUBLIC_KEY' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Allow passwordless sudo for deploy (recommended: deploy key user only):

```bash
echo 'ubuntu ALL=(ALL) NOPASSWD: /bin/bash /opt/polkaudit/deploy/alibaba/remote-deploy.sh, /bin/systemctl, /usr/bin/tee, /bin/sed' | sudo tee /etc/sudoers.d/polkaudit-deploy
sudo chmod 440 /etc/sudoers.d/polkaudit-deploy
```

(Or keep full NOPASSWD for `ubuntu` on a locked-down SAS — trade security for simplicity.)

### 2. Repo secrets

GitHub → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|--------|
| `SAS_HOST` | Public IP / hostname |
| `SAS_USER` | `ubuntu` |
| `SAS_SSH_KEY` | **Private** key PEM contents |
| `SAS_PORT` | Optional, default `22` |
| `SAS_BRANCH` | Optional, default `main` |

### 3. Workflow

File: [`.github/workflows/deploy-alibaba-sas.yml`](../.github/workflows/deploy-alibaba-sas.yml)

Triggers on push to `main` when these paths change:

- `apps/backend/**`
- `apps/indexer/**`
- `deploy/alibaba/**`

Also available as **workflow_dispatch** (manual run).

Deploy steps on the server (`remote-deploy.sh`):

1. `git fetch` + `reset --hard origin/main`  
2. `pip install -r requirements.txt` (backend + indexer)  
3. `alembic upgrade head`  
4. `systemctl restart` both services  
5. `curl /health`

### 4. Private GitHub repo

If the repo is private, add a **read-only deploy key** on the SAS host so `git fetch` works:

```bash
# On SAS
ssh-keygen -t ed25519 -f /home/ubuntu/.ssh/polkaudit_github -N ""
cat /home/ubuntu/.ssh/polkaudit_github.pub
# Add as Deploy key (read-only) in GitHub → Settings → Deploy keys
```

Configure git SSH remote under `/opt/polkaudit`.

---

## Database & disk safety

| Control | Default |
|---------|---------|
| Local Postgres | Same VM (`127.0.0.1`) |
| Nightly prune | Keep last **100 000** blocks (`prune-old-blocks.sh`) |
| systemd restart | Always |
| Secrets | `/etc/polkaudit/*.env` (mode `640`) |

**Do not** backfill millions of blocks on a 40 GB disk. Use tip window + prune.

Optional: move Postgres data to a separate data disk mounted at `/data`.

Daily backup (recommended):

```bash
# example — adapt to OSS credentials
0 4 * * * root sudo -u postgres pg_dump polkaudit | gzip > /data/backups/polkaudit-$(date +\%F).sql.gz
```

---

## DNS / TLS

1. Point `api.polkaudit.xyz` **A** record → SAS public IP  
2. Install certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.polkaudit.xyz
```

3. Point Vercel `NEXT_PUBLIC_API_URL` at `https://api.polkaudit.xyz/api/v1`

---

## Files

| Path | Purpose |
|------|---------|
| `deploy/alibaba/setup-sas.sh` | One-time bootstrap |
| `deploy/alibaba/remote-deploy.sh` | CI/CD deploy entrypoint |
| `deploy/alibaba/*.service` | systemd units |
| `deploy/alibaba/prune-old-blocks.sh` | Disk retention |
| `deploy/alibaba/*.env.example` | Env templates |
| `.github/workflows/deploy-alibaba-sas.yml` | GitHub Actions workflow |

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Action fails “secret not set” | Add `SAS_*` secrets |
| Action fails SSH | Firewall port 22; public key on server |
| `git fetch` denied | Deploy key / public repo |
| DiskFull again | Lower `RETAIN_BLOCKS`; raise disk; tip-only start |
| API 502 | `journalctl -u polkaudit-backend -e` |
| Indexer idle | `journalctl -u polkaudit-indexer -f`; RPC / `DATABASE_URL` |

---

## Relationship to GCP / Vercel

| Component | Typical home |
|-----------|----------------|
| Landing + dashboard | Vercel |
| API + indexer + DB | Alibaba SAS (this guide) **or** Cloud Run + Neon |
| CI for SAS | GitHub Actions (this workflow) |
| CI for Cloud Run | Cloud Build (`cloudbuild.yaml`) |

You can run **either** SAS **or** Cloud Run for API/indexer — avoid two writers on the same DB.
