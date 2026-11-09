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

# Root SSH + polkaudit-owned tree
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
as_user "git config --global --add safe.directory '$INSTALL_DIR'" 2>/dev/null || true

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
# Landing stays on Vercel — do not install/start on SAS

echo "== refresh systemd units =="
for unit in indexer backend frontend; do
  src="$INSTALL_DIR/deploy/alibaba/polkaudit-${unit}.service"
  if [[ -f "$src" ]]; then
    as_root "sed 's/User=polkaudit/User=${RUN_USER}/; s/Group=polkaudit/Group=${RUN_USER}/; s/User=ubuntu/User=${RUN_USER}/; s/Group=ubuntu/Group=${RUN_USER}/' '$src' > '/etc/systemd/system/polkaudit-${unit}.service'"
  fi
done

# Nginx + HTTPS: base proxy config, then always reattach Let's Encrypt (Chrome requires HTTPS).
if [[ -f "$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf" ]]; then
  as_root "
    set -e
    SITE=/etc/nginx/sites-available/polkaudit
    cp '$INSTALL_DIR/deploy/alibaba/nginx-polkaudit.conf' \"\$SITE\"
    ln -sfn \"\$SITE\" /etc/nginx/sites-enabled/polkaudit
    rm -f /etc/nginx/sites-enabled/default
    nginx -t

    if [[ -d /etc/letsencrypt/live/app.polkaudit.xyz ]]; then
      echo 'nginx: reinstalling TLS certs for app + api'
      certbot --nginx \
        -d app.polkaudit.xyz -d api.polkaudit.xyz \
        --non-interactive --reinstall --redirect \
        --agree-tos --register-unsafely-without-email \
        || certbot install --cert-name app.polkaudit.xyz --nginx --non-interactive || true
    else
      echo 'WARNING: no certs in /etc/letsencrypt/live/app.polkaudit.xyz — run certbot once on the host'
    fi

    nginx -t && systemctl reload nginx
    ss -tlnp | grep -E ':443|:80' || true
  "
fi

as_root "
  systemctl daemon-reload
  systemctl enable polkaudit-backend polkaudit-indexer polkaudit-frontend
  systemctl disable --now polkaudit-landing 2>/dev/null || true
  systemctl restart polkaudit-backend polkaudit-indexer
  if [[ -f '$INSTALL_DIR/apps/frontend/.next/standalone/server.js' ]]; then systemctl restart polkaudit-frontend; fi
"

echo "== health checks =="
sleep 3
curl -fsS "http://127.0.0.1:8080/health"
echo ""
curl -fsS -o /dev/null -w "frontend:%{http_code}\n" "http://127.0.0.1:3000/" || echo "frontend: not up yet"
curl -fsS -o /dev/null -w "https_app:%{http_code}\n" --connect-timeout 5 "https://127.0.0.1/" -H "Host: app.polkaudit.xyz" -k \
  || echo "https_app: not listening (certbot may need first-time run)"
systemctl is-active polkaudit-backend polkaudit-indexer polkaudit-frontend nginx || true
echo "Deploy OK @ $(git -C "$INSTALL_DIR" rev-parse --short HEAD) (landing = Vercel)"
