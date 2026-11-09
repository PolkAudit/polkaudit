#!/usr/bin/env bash
# Idempotent deploy ON the SAS host (GitHub Actions SSHs here after uploading Next builds).
# Assumes setup-sas.sh already ran once.
# SSH login is often root on Alibaba SAS; app processes run as RUN_USER (polkaudit).
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/polkaudit}"
BRANCH="${BRANCH:-main}"
ARTIFACT_DIR="${ARTIFACT_DIR:-/tmp/polkaudit-artifacts}"

# Prefer dedicated app user (Alibaba SAS is often root-only SSH)
if [[ -z "${RUN_USER:-}" ]]; then
  if id polkaudit &>/dev/null; then
    RUN_USER=polkaudit
  elif id ubuntu &>/dev/null; then
    RUN_USER=ubuntu
  else
    RUN_USER=root
  fi
fi
if [[ "$RUN_USER" == "root" ]]; then
  echo "WARNING: RUN_USER=root — prefer creating user polkaudit via setup-sas.sh"
fi

as_user() {
  if [[ "$(id -un)" == "$RUN_USER" ]]; then
    bash -c "$1"
  elif [[ "$(id -u)" -eq 0 ]]; then
    sudo -u "$RUN_USER" bash -c "$1"
  else
    sudo -u "$RUN_USER" bash -c "$1"
  fi
}

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    bash -c "$1"
  else
    sudo bash -c "$1"
  fi
}

cd "$INSTALL_DIR"

echo "== git sync ($BRANCH) as $RUN_USER =="
as_user "
  cd '$INSTALL_DIR'
  git fetch --prune origin
  git checkout '$BRANCH'
  git reset --hard origin/${BRANCH}
"

echo "== indexer deps =="
as_user "
  cd '$INSTALL_DIR/apps/indexer'
  ./venv/bin/pip install -q -r requirements.txt
"

echo "== backend deps + migrations =="
as_user "
  set -a
  source /etc/polkaudit/backend.env
  set +a
  cd '$INSTALL_DIR/apps/backend'
  ./venv/bin/pip install -q -r requirements.txt
  ./venv/bin/alembic upgrade head
"

echo "== install Next.js standalone artifacts (if present) =="
install_next_app() {
  local name="$1"
  local tarball="$ARTIFACT_DIR/${name}.tar.gz"
  local dest="$INSTALL_DIR/apps/${name}/.next/standalone"
  if [[ -f "$tarball" ]]; then
    echo "Installing $name from $tarball"
    as_root "rm -rf '$dest'; mkdir -p '$dest'; tar -xzf '$tarball' -C '$dest'; chown -R '$RUN_USER:$RUN_USER' '$INSTALL_DIR/apps/${name}/.next'"
  else
    echo "No artifact for $name at $tarball — skipping UI update"
  fi
}
install_next_app frontend
install_next_app landing

echo "== refresh systemd units =="
for unit in indexer backend frontend landing; do
  src="$INSTALL_DIR/deploy/alibaba/polkaudit-${unit}.service"
  if [[ -f "$src" ]]; then
    as_root "sed 's/User=polkaudit/User=${RUN_USER}/; s/Group=polkaudit/Group=${RUN_USER}/; s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/' '$src' > '/etc/systemd/system/polkaudit-${unit}.service'"
  fi
done

if [[ -f "$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf" ]]; then
  as_root "
    cp '$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf' /etc/nginx/sites-available/polkaudit
    ln -sfn /etc/nginx/sites-available/polkaudit /etc/nginx/sites-enabled/polkaudit
    nginx -t && systemctl reload nginx
  "
fi

as_root "
  systemctl daemon-reload
  systemctl enable polkaudit-backend polkaudit-indexer polkaudit-frontend polkaudit-landing
  systemctl restart polkaudit-backend polkaudit-indexer
  if [[ -f '$INSTALL_DIR/apps/frontend/.next/standalone/server.js' ]]; then systemctl restart polkaudit-frontend; fi
  if [[ -f '$INSTALL_DIR/apps/landing/.next/standalone/server.js' ]]; then systemctl restart polkaudit-landing; fi
"

echo "== health checks =="
sleep 3
curl -fsS "http://127.0.0.1:8080/health"
echo ""
curl -fsS -o /dev/null -w "frontend:%{http_code}\n" "http://127.0.0.1:3000/" || echo "frontend: not up yet"
curl -fsS -o /dev/null -w "landing:%{http_code}\n" "http://127.0.0.1:3001/" || echo "landing: not up yet"
systemctl is-active polkaudit-backend polkaudit-indexer || true
systemctl is-active polkaudit-frontend polkaudit-landing || true
echo "Deploy OK @ $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
