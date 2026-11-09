#!/usr/bin/env bash
# Prune heavy indexer tables to protect small SAS disks.
# Keeps the most recent RETAIN_BLOCKS (default 100000).
#
# Usage (cron / root):
#   RETAIN_BLOCKS=100000 /opt/polkaudit/deploy/alibaba/prune-old-blocks.sh
#
# Requires: psql, DATABASE_URL in /etc/polkaudit/indexer.env (postgresql:// or +asyncpg)
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/polkaudit/indexer.env}"
RETAIN_BLOCKS="${RETAIN_BLOCKS:-100000}"
DISK_ALERT_PCT="${DISK_ALERT_PCT:-85}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # strip asyncpg driver for psql
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL)=' "$ENV_FILE" | sed 's/+asyncpg//')
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set"
  exit 1
fi

# Optional: warn if data disk is nearly full
if command -v df >/dev/null; then
  USAGE=$(df -P /data 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}' || df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
  if [[ -n "$USAGE" && "$USAGE" -ge "$DISK_ALERT_PCT" ]]; then
    echo "WARNING: disk usage ${USAGE}% >= ${DISK_ALERT_PCT}%"
  fi
fi

echo "Pruning indexer tables; retaining last ${RETAIN_BLOCKS} blocks..."

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE
  tip BIGINT;
  cutoff BIGINT;
BEGIN
  SELECT COALESCE(MAX(block_number), 0) INTO tip FROM processed_blocks;
  cutoff := GREATEST(tip - ${RETAIN_BLOCKS}, 0);
  IF tip = 0 OR cutoff = 0 THEN
    RAISE NOTICE 'Nothing to prune (tip=%)', tip;
    RETURN;
  END IF;

  DELETE FROM extrinsics WHERE block_number < cutoff;
  DELETE FROM blocks WHERE block_number < cutoff;
  DELETE FROM processed_blocks WHERE block_number < cutoff;
  DELETE FROM dead_letter_queue WHERE block_number < cutoff;
  -- Keep governance rows (proposals/votes/treasury) for audit demo value

  RAISE NOTICE 'Pruned below block % (tip %)', cutoff, tip;
END
\$\$;
VACUUM (ANALYZE) extrinsics;
VACUUM (ANALYZE) blocks;
VACUUM (ANALYZE) processed_blocks;
SQL

echo "Prune complete."
