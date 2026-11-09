#!/usr/bin/env bash
# Idempotent deploy ON the SAS host (GitHub Actions SSHs here after uploading Next builds).
# Assumes setup-sas.sh already ran once.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/polkaudit}"
BRANCH="${BRANCH:-main}"
RUN_USER="${RUN_USER:-ubuntu}"
ARTIFACT_DIR="${ARTIFACT_DIR:-/tmp/polkaudit-artifacts}"

cd "$INSTALL_DIR"

echo "== git sync ($BRANCH) =="
sudo -u "$RUN_USER" git fetch --prune origin
sudo -u "$RUN_USER" git checkout "$BRANCH"
sudo -u "$RUN_USER" git reset --hard "origin/${BRANCH}"

echo "== indexer deps =="
sudo -u "$RUN_USER" bash -c "
  cd '$INSTALL_DIR/apps/indexer'
  ./venv/bin/pip install -q -r requirements.txt
"

echo "== backend deps + migrations =="
sudo -u "$RUN_USER" bash -c "
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
    rm -rf "$dest"
    mkdir -p "$dest"
    tar -xzf "$tarball" -C "$dest"
    chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR/apps/${name}/.next"
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
    sed "s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" "$src" \
      | sudo tee "/etc/systemd/system/polkaudit-${unit}.service" >/dev/null
  fi
done

if [[ -f "$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf" ]]; then
  sudo cp "$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf" /etc/nginx/sites-available/polkaudit
  sudo ln -sfn /etc/nginx/sites-available/polkaudit /etc/nginx/sites-enabled/polkaudit
  sudo nginx -t && sudo systemctl reload nginx
fi

sudo systemctl daemon-reload
sudo systemctl enable polkaudit-backend polkaudit-indexer polkaudit-frontend polkaudit-landing
sudo systemctl restart polkaudit-backend polkaudit-indexer
# Restart UIs only if standalone is present
[[ -f "$INSTALL_DIR/apps/frontend/.next/standalone/server.js" ]] && sudo systemctl restart polkaudit-frontend || true
[[ -f "$INSTALL_DIR/apps/landing/.next/standalone/server.js" ]] && sudo systemctl restart polkaudit-landing || true

echo "== health checks =="
sleep 3
curl -fsS "http://127.0.0.1:8080/health"
echo ""
curl -fsS -o /dev/null -w "frontend:%{http_code}\n" "http://127.0.0.1:3000/" || echo "frontend: not up yet"
curl -fsS -o /dev/null -w "landing:%{http_code}\n" "http://127.0.0.1:3001/" || echo "landing: not up yet"
sudo systemctl is-active polkaudit-backend polkaudit-indexer || true
sudo systemctl is-active polkaudit-frontend polkaudit-landing || true
echo "Deploy OK @ $(git rev-parse --short HEAD)"
