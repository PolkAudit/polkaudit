#!/usr/bin/env bash
# Re-scan Polkadot blocks from START (inclusive) so OpenGov/treasury parsing can catch up.
# Does NOT wipe the whole DB — only clears indexed rows at/after START, then restarts the indexer.
#
# Usage (as root on SAS):
#   bash /opt/polkaudit/deploy/alibaba/reindex-range.sh 28000000
#   bash /opt/polkaudit/deploy/alibaba/reindex-range.sh 28000000 28100000
#
# Tip: pick a height a few days behind tip where OpenGov activity is known, e.g. from
# Subscan referenda list. After restart, watch: journalctl -u polkaudit-indexer -f
#
set -euo pipefail

START="${1:?Usage: $0 START_BLOCK [END_BLOCK]}"
END="${2:-}"
ENV_FILE="${ENV_FILE:-/etc/polkaudit/indexer.env}"
DB_URL=""

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

DB_URL="${DATABASE_URL:?DATABASE_URL required in $ENV_FILE}"
# psql wants postgresql:// not +asyncpg
PSQL_URL="$(echo "$DB_URL" | sed 's|+asyncpg||; s|postgresql+asyncpg://|postgresql://|')"

echo "== PolkAudit reindex =="
echo "Start block: $START"
[[ -n "$END" ]] && echo "End block:   $END (rows above END are kept; indexer still catches up to tip)"

systemctl stop polkaudit-indexer || true

if [[ -n "$END" ]]; then
  RANGE_SQL="block_number >= ${START} AND block_number <= ${END}"
else
  RANGE_SQL="block_number >= ${START}"
fi

echo "Clearing indexed rows where $RANGE_SQL ..."
psql "$PSQL_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DELETE FROM votes WHERE ${RANGE_SQL};
DELETE FROM proposals WHERE ${RANGE_SQL};
DELETE FROM treasury_spends WHERE ${RANGE_SQL};
DELETE FROM extrinsics WHERE ${RANGE_SQL};
DELETE FROM blocks WHERE ${RANGE_SQL};
DELETE FROM processed_blocks WHERE ${RANGE_SQL};
-- Reset contiguous cursor so the next segment begins at START (table may not exist pre-migration)
DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'indexer_cursor'
  ) THEN
    DELETE FROM indexer_cursor;
    INSERT INTO indexer_cursor (id, range_start, contiguous_through)
    VALUES (1, ${START}, ${START} - 1);
  END IF;
END
\$\$;
COMMIT;
SELECT
  (SELECT COUNT(*) FROM processed_blocks) AS processed_remaining,
  (SELECT COALESCE(MAX(block_number),0) FROM processed_blocks) AS max_processed,
  (SELECT COUNT(*) FROM proposals) AS proposals,
  (SELECT COUNT(*) FROM votes) AS votes,
  (SELECT COUNT(*) FROM treasury_spends) AS treasury_spends;
SQL

# Point indexer at START so catch-up resumes from there even if a higher tip was processed before
if grep -q '^INDEXER_START_BLOCK=' "$ENV_FILE"; then
  sed -i "s|^INDEXER_START_BLOCK=.*|INDEXER_START_BLOCK=${START}|" "$ENV_FILE"
else
  echo "INDEXER_START_BLOCK=${START}" >> "$ENV_FILE"
fi

echo "Updated INDEXER_START_BLOCK=${START} in $ENV_FILE"
systemctl start polkaudit-indexer
systemctl is-active polkaudit-indexer
echo ""
echo "Indexer restarted. Follow logs:"
echo "  journalctl -u polkaudit-indexer -f"
echo "Look for: Found governance  proposals=… votes=… spends=…"
echo "Dashboard: https://app.polkaudit.xyz"
