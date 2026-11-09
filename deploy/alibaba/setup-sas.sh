#!/usr/bin/env bash
# One-time bootstrap: PolkAudit API + Indexer + local PostgreSQL on Alibaba SAS (Ubuntu).
#
# Usage (on the SAS instance as root):
#   sudo bash deploy/alibaba/setup-sas.sh --repo-url https://github.com/ViSa-Innovations/polkaudit.git
#   sudo bash deploy/alibaba/setup-sas.sh --skip-clone
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/polkaudit}"
REPO_URL="${REPO_URL:-https://github.com/ViSa-Innovations/polkaudit.git}"
SKIP_CLONE=0
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-polkaudit}"
DB_USER="${DB_USER:-polkaudit}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-clone) SKIP_CLONE=1; shift ;;
    --repo-url) REPO_URL="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: sudo $0 [--skip-clone] [--repo-url URL] [--branch main] [--install-dir /opt/polkaudit]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

RUN_USER="${SUDO_USER:-ubuntu}"
if ! id "$RUN_USER" &>/dev/null; then
  RUN_USER=ubuntu
fi

echo "== PolkAudit Alibaba SAS setup =="
echo "Install dir: $INSTALL_DIR"
echo "Service user: $RUN_USER"
echo "Branch: $BRANCH"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  git curl nginx python3 python3-venv python3-pip \
  postgresql postgresql-contrib libpq-dev build-essential

# Optional dedicated data mount point (create if missing; bind to root if no separate disk)
mkdir -p /data/postgresql /etc/polkaudit
if [[ ! -d /var/lib/postgresql ]]; then
  mkdir -p /var/lib/postgresql
fi

if [[ "$SKIP_CLONE" -eq 0 ]]; then
  echo "Cloning $REPO_URL ($BRANCH) -> $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
else
  echo "Using existing tree at $INSTALL_DIR"
fi

chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

# --- PostgreSQL role + database ---
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  echo "Created DB user/db. Saving password into env templates..."
  install -m 640 -o root -g "$RUN_USER" /dev/null /etc/polkaudit/.db_pass
  echo "$DB_PASS" > /etc/polkaudit/.db_pass
else
  echo "DB user $DB_USER already exists — not rotating password"
  DB_PASS="$(cat /etc/polkaudit/.db_pass 2>/dev/null || true)"
fi

SYNC_URL=""
if [[ -n "${DB_PASS:-}" ]]; then
  SYNC_URL="postgresql+asyncpg://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
fi

# --- Env files ---
if [[ ! -f /etc/polkaudit/indexer.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/indexer.env.example" /etc/polkaudit/indexer.env
  if [[ -n "$SYNC_URL" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${SYNC_URL}|" /etc/polkaudit/indexer.env
  fi
  chown root:"$RUN_USER" /etc/polkaudit/indexer.env
  chmod 640 /etc/polkaudit/indexer.env
fi

if [[ ! -f /etc/polkaudit/backend.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/backend.env.example" /etc/polkaudit/backend.env
  API_KEY="$(openssl rand -hex 32)"
  if [[ -n "$SYNC_URL" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${SYNC_URL}|" /etc/polkaudit/backend.env
  fi
  sed -i "s|^API_KEY=.*|API_KEY=${API_KEY}|" /etc/polkaudit/backend.env
  chown root:"$RUN_USER" /etc/polkaudit/backend.env
  chmod 640 /etc/polkaudit/backend.env
  echo "Generated API_KEY (also in /etc/polkaudit/backend.env)"
fi

# --- Python venvs ---
for APP in indexer backend; do
  APP_DIR="$INSTALL_DIR/apps/$APP"
  echo "venv: $APP"
  sudo -u "$RUN_USER" bash -c "
    set -e
    cd '$APP_DIR'
    python3 -m venv venv
    ./venv/bin/pip install -q --upgrade pip
    ./venv/bin/pip install -q -r requirements.txt
  "
done

# --- Migrations ---
echo "Running Alembic migrations..."
sudo -u "$RUN_USER" bash -c "
  set -a
  # shellcheck disable=SC1091
  source /etc/polkaudit/backend.env
  set +a
  cd '$INSTALL_DIR/apps/backend'
  ./venv/bin/alembic upgrade head
"

# --- systemd ---
sed "s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" \
  "$INSTALL_DIR/deploy/alibaba/polkaudit-indexer.service" \
  > /etc/systemd/system/polkaudit-indexer.service
sed "s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" \
  "$INSTALL_DIR/deploy/alibaba/polkaudit-backend.service" \
  > /etc/systemd/system/polkaudit-backend.service

chmod +x "$INSTALL_DIR/deploy/alibaba/prune-old-blocks.sh" \
  "$INSTALL_DIR/deploy/alibaba/remote-deploy.sh"

systemctl daemon-reload
systemctl enable --now polkaudit-backend polkaudit-indexer

# --- nginx reverse proxy ---
cat > /etc/nginx/sites-available/polkaudit <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
ln -sfn /etc/nginx/sites-available/polkaudit /etc/nginx/sites-enabled/polkaudit
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- daily prune cron ---
CRON_FILE=/etc/cron.d/polkaudit-prune
cat > "$CRON_FILE" <<EOF
# Prune indexer audit tables nightly (retain last 100k blocks)
15 3 * * * root RETAIN_BLOCKS=100000 ${INSTALL_DIR}/deploy/alibaba/prune-old-blocks.sh >> /var/log/polkaudit-prune.log 2>&1
EOF
chmod 644 "$CRON_FILE"

echo ""
echo "=== Setup complete ==="
echo "  Backend:  systemctl status polkaudit-backend"
echo "  Indexer:  systemctl status polkaudit-indexer"
echo "  Health:   curl -s http://127.0.0.1/health"
echo "  Envs:     /etc/polkaudit/{backend,indexer}.env"
echo "  Prune:    /etc/cron.d/polkaudit-prune"
echo "Next: point DNS A record for api.polkaudit.xyz here; add TLS (certbot)."
echo "CI/CD: add GitHub secrets SAS_HOST / SAS_USER / SAS_SSH_KEY — see docs/ALIBABA_SAS_DEPLOY.md"
