#!/usr/bin/env bash
# Idempotent deploy step run ON the SAS host (called by GitHub Actions over SSH).
# Assumes setup-sas.sh already ran once.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/polkaudit}"
BRANCH="${BRANCH:-main}"
RUN_USER="${RUN_USER:-ubuntu}"

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

echo "== refresh systemd units =="
sed "s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" \
  "$INSTALL_DIR/deploy/alibaba/polkaudit-indexer.service" \
  | sudo tee /etc/systemd/system/polkaudit-indexer.service >/dev/null
sed "s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/" \
  "$INSTALL_DIR/deploy/alibaba/polkaudit-backend.service" \
  | sudo tee /etc/systemd/system/polkaudit-backend.service >/dev/null

sudo systemctl daemon-reload
sudo systemctl restart polkaudit-backend polkaudit-indexer

echo "== health check =="
sleep 3
curl -fsS "http://127.0.0.1/health" || curl -fsS "http://127.0.0.1:8080/health"
echo ""
sudo systemctl is-active polkaudit-backend polkaudit-indexer
echo "Deploy OK @ $(git rev-parse --short HEAD)"
