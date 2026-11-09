#!/usr/bin/env bash
# After `next build` with output:'standalone', assemble a runnable tree in-place.
# Usage: bash deploy/alibaba/pack-next-standalone.sh apps/frontend
#        bash deploy/alibaba/pack-next-standalone.sh apps/landing
set -euo pipefail

APP_DIR="${1:?Usage: $0 apps/frontend|apps/console|apps/landing}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_PATH="$ROOT/$APP_DIR"

if [[ ! -d "$APP_PATH/.next/standalone" ]]; then
  echo "Missing $APP_PATH/.next/standalone — run next build with output:'standalone' first"
  exit 1
fi

# Next may nest standalone under the app path segment
STANDALONE="$APP_PATH/.next/standalone"
if [[ -f "$STANDALONE/server.js" ]]; then
  TARGET="$STANDALONE"
elif [[ -f "$STANDALONE/$APP_DIR/server.js" ]]; then
  TARGET="$STANDALONE/$APP_DIR"
else
  echo "Could not find server.js under $STANDALONE"
  find "$STANDALONE" -name server.js | head
  exit 1
fi

mkdir -p "$TARGET/.next"
rm -rf "$TARGET/.next/static"
cp -a "$APP_PATH/.next/static" "$TARGET/.next/static"
if [[ -d "$APP_PATH/public" ]]; then
  rm -rf "$TARGET/public"
  cp -a "$APP_PATH/public" "$TARGET/public"
fi

# Normalize so systemd WorkingDirectory=/opt/.../apps/X/.next/standalone always works
if [[ "$TARGET" != "$STANDALONE" ]]; then
  echo "Flattening nested standalone into $STANDALONE"
  tmp=$(mktemp -d)
  cp -a "$TARGET"/. "$tmp/"
  rm -rf "$STANDALONE"
  mkdir -p "$STANDALONE"
  cp -a "$tmp"/. "$STANDALONE/"
  rm -rf "$tmp"
fi

echo "Packed standalone OK: $APP_PATH/.next/standalone (server.js ready)"
