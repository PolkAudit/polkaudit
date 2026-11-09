#!/usr/bin/env bash
# One-time bootstrap: full PolkAudit stack on Alibaba SAS (Ubuntu):
#   PostgreSQL + API + Indexer + (Next.js UI installed later via GitHub Actions artifacts)
#
# Usage (on the SAS instance as root):
#   sudo bash deploy/alibaba/setup-sas.sh --repo-url https://github.com/PolkAudit/polkaudit.git
#   sudo bash deploy/alibaba/setup-sas.sh --skip-clone
#
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/polkaudit}"
REPO_URL="${REPO_URL:-https://github.com/PolkAudit/polkaudit.git}"
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

# Alibaba SAS often only has root SSH — never run app processes as root.
# Prefer existing ubuntu, else create a dedicated polkaudit system user.
if [[ -n "${FORCE_RUN_USER:-}" ]]; then
  RUN_USER="$FORCE_RUN_USER"
elif id ubuntu &>/dev/null; then
  RUN_USER=ubuntu
elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]] && id "${SUDO_USER}" &>/dev/null; then
  RUN_USER="${SUDO_USER}"
else
  RUN_USER=polkaudit
fi

if ! id "$RUN_USER" &>/dev/null; then
  echo "Creating service user: $RUN_USER"
  useradd --create-home --shell /bin/bash "$RUN_USER"
fi

echo "== PolkAudit Alibaba SAS setup =="
echo "Install dir: $INSTALL_DIR"
echo "Service user: $RUN_USER  (SSH may still be root — that is OK)"
echo "Branch: $BRANCH"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  git curl nginx python3 python3-venv python3-pip \
  postgresql postgresql-contrib libpq-dev build-essential

# Node 20 for running Next.js standalone (builds happen in GitHub Actions)
if ! command -v node >/dev/null || [[ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

# Swap helps on 2 GiB SAS when Postgres + indexer + two Next processes share RAM
if [[ ! -f /swapfile ]]; then
  echo "Creating 2G swapfile..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

mkdir -p /data/postgresql /etc/polkaudit /tmp/polkaudit-artifacts
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
# Root SSH on Alibaba + polkaudit-owned tree: avoid "dubious ownership" on git fetch
git config --global --add safe.directory "$INSTALL_DIR"
sudo -u "$RUN_USER" git config --global --add safe.directory "$INSTALL_DIR" || true
# Keep deploy scripts executable after chown
chmod +x "$INSTALL_DIR/deploy/alibaba/"*.sh 2>/dev/null || true

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
# Always re-own for current RUN_USER (earlier runs may have used ubuntu/root).
fix_env_perms() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  chown root:"$RUN_USER" "$f"
  chmod 640 "$f"
}

if [[ ! -f /etc/polkaudit/indexer.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/indexer.env.example" /etc/polkaudit/indexer.env
  if [[ -n "$SYNC_URL" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${SYNC_URL}|" /etc/polkaudit/indexer.env
  fi
fi
fix_env_perms /etc/polkaudit/indexer.env
fix_env_perms /etc/polkaudit/.db_pass

API_KEY=""
if [[ ! -f /etc/polkaudit/backend.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/backend.env.example" /etc/polkaudit/backend.env
  API_KEY="$(openssl rand -hex 32)"
  if [[ -n "$SYNC_URL" ]]; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${SYNC_URL}|" /etc/polkaudit/backend.env
  fi
  sed -i "s|^API_KEY=.*|API_KEY=${API_KEY}|" /etc/polkaudit/backend.env
  echo "Generated API_KEY (also in /etc/polkaudit/backend.env)"
else
  API_KEY="$(grep -E '^API_KEY=' /etc/polkaudit/backend.env | cut -d= -f2- || true)"
fi
fix_env_perms /etc/polkaudit/backend.env

if [[ ! -f /etc/polkaudit/frontend.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/frontend.env.example" /etc/polkaudit/frontend.env
  if [[ -n "$API_KEY" ]]; then
    sed -i "s|^API_KEY=.*|API_KEY=${API_KEY}|" /etc/polkaudit/frontend.env
    sed -i "s|^NEXT_PUBLIC_API_KEY=.*|NEXT_PUBLIC_API_KEY=${API_KEY}|" /etc/polkaudit/frontend.env
  fi
fi
fix_env_perms /etc/polkaudit/frontend.env

if [[ ! -f /etc/polkaudit/console.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/console.env.example" /etc/polkaudit/console.env
  if [[ -n "$API_KEY" ]]; then
    sed -i "s|^API_KEY=.*|API_KEY=${API_KEY}|" /etc/polkaudit/console.env
    sed -i "s|^NEXT_PUBLIC_API_KEY=.*|NEXT_PUBLIC_API_KEY=${API_KEY}|" /etc/polkaudit/console.env
  fi
fi
fix_env_perms /etc/polkaudit/console.env

if [[ ! -f /etc/polkaudit/landing.env ]]; then
  cp "$INSTALL_DIR/deploy/alibaba/landing.env.example" /etc/polkaudit/landing.env
fi
fix_env_perms /etc/polkaudit/landing.env

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

# --- systemd (API + indexer now; dashboard/console after first Actions deploy) ---
# Landing stays on Vercel — do not enable polkaudit-landing on SAS.
for unit in indexer backend frontend console; do
  sed "s/User=polkaudit/User=${RUN_USER}/; s/Group=polkaudit/Group=${RUN_USER}/; s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" \
    "$INSTALL_DIR/deploy/alibaba/polkaudit-${unit}.service" \
    > "/etc/systemd/system/polkaudit-${unit}.service"
done

chmod +x "$INSTALL_DIR/deploy/alibaba/"*.sh

systemctl daemon-reload
systemctl enable --now polkaudit-backend polkaudit-indexer
systemctl enable polkaudit-frontend polkaudit-console
systemctl disable --now polkaudit-landing 2>/dev/null || true

# --- nginx (api / app / console) ---
cp "$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf" /etc/nginx/sites-available/polkaudit
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
echo "=== Setup complete (API + indexer) ==="
echo "  Backend:   systemctl status polkaudit-backend"
echo "  Indexer:   systemctl status polkaudit-indexer"
echo "  Health:    curl -s http://127.0.0.1:8080/health"
echo "  Envs:      /etc/polkaudit/{backend,indexer,frontend,console}.env"
echo "  Prune:     /etc/cron.d/polkaudit-prune"
echo "  Swap:      enabled (2G) for 2 GiB SAS"
echo ""
echo "Next:"
echo "  1) Add GitHub secrets SAS_HOST / SAS_USER / SAS_SSH_KEY"
echo "  2) Push or run workflow 'Deploy Alibaba SAS' — builds dashboard + console in CI"
echo "  3) Point DNS: app + api + console → this IP (landing stays on Vercel)"
echo "  4) sudo certbot --nginx -d app.polkaudit.xyz -d api.polkaudit.xyz -d console.polkaudit.xyz"
echo "  5) APP_PUBLIC_URL=https://console.polkaudit.xyz in /etc/polkaudit/backend.env"
echo "See docs/ALIBABA_SAS_DEPLOY.md"
