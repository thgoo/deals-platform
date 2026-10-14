#!/usr/bin/env bash
# Load a production dump (.sql or .sql.gz) into the local MariaDB container.
# Replaces the local `deals` database entirely.
#
#   scripts/db-restore.sh ../prod-2026-10-14.sql.gz
set -euo pipefail

dump="${1:?usage: scripts/db-restore.sh <dump.sql[.gz]>}"
[ -f "$dump" ] || { echo "file not found: $dump" >&2; exit 1; }

cd "$(dirname "$0")/.."

docker compose up -d --wait mariadb

sql() { docker compose exec -T mariadb mariadb -uroot -proot "$@"; }

echo "Recreating database 'deals'..."
sql -e "DROP DATABASE IF EXISTS deals; CREATE DATABASE deals CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON deals.* TO 'deals'@'%';"

echo "Importing $dump (this takes a few minutes)..."
start=$(date +%s)
case "$dump" in
  *.gz) gunzip -c "$dump" ;;
  *)    cat "$dump" ;;
esac | sql --max-allowed-packet=512M deals
echo "Imported in $(( $(date +%s) - start ))s."

sql -e "
  SELECT 'deals' AS tbl, COUNT(*) AS \`rows\` FROM deals.deals
  UNION ALL SELECT 'products', COUNT(*) FROM deals.products
  UNION ALL SELECT 'product_url_mappings', COUNT(*) FROM deals.product_url_mappings
  UNION ALL SELECT 'product_match_decisions', COUNT(*) FROM deals.product_match_decisions
  UNION ALL SELECT 'alerts', COUNT(*) FROM deals.alerts
  UNION ALL SELECT 'users', COUNT(*) FROM deals.users;"

# The dump excludes `sessions` (live login tokens), but __drizzle_migrations says it
# exists, so migrations won't recreate it. Same DDL as drizzle/0000_loose_thundra.sql.
sql deals -e "
  CREATE TABLE IF NOT EXISTS sessions (
    id varchar(255) NOT NULL,
    user_id bigint unsigned NOT NULL,
    expires_at datetime NOT NULL,
    CONSTRAINT sessions_id PRIMARY KEY (id),
    CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users (id)
  );"
echo "Done."
