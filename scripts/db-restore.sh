#!/usr/bin/env bash
# Load a production dump into the local databases.
#
#   scripts/db-restore.sh ../prod-2026-10-14.sql.gz     # MariaDB dump (.sql/.sql.gz) → MariaDB → Postgres
#   scripts/db-restore.sh ../prod-2026-11-01.dump       # Postgres dump (pg_dump -Fc) → Postgres
#
# Replaces the local `deals` database(s) entirely.
set -euo pipefail

dump="${1:?usage: scripts/db-restore.sh <dump>}"
[ -f "$dump" ] || { echo "file not found: $dump" >&2; exit 1; }
dump=$(cd "$(dirname "$dump")" && pwd)/$(basename "$dump")

cd "$(dirname "$0")/.."
PG_URL=postgres://deals:deals@127.0.0.1:5432/deals

reset_postgres() {
  docker compose up -d --wait postgres
  docker compose exec -T postgres psql -q -U deals -d postgres \
    -c "DROP DATABASE IF EXISTS deals WITH (FORCE)" -c "CREATE DATABASE deals"
}

if [[ "$dump" == *.dump ]]; then
  # ── Postgres custom-format dump (production after the phase 5 cutover) ──────
  reset_postgres
  echo "Restoring $dump into Postgres..."
  docker compose exec -T postgres pg_restore -U deals -d deals --no-owner < "$dump"
  docker compose exec -T postgres psql -U deals -d deals -c "
    SELECT 'deals' AS tbl, COUNT(*) FROM deals UNION ALL SELECT 'products', COUNT(*) FROM products
    UNION ALL SELECT 'product_url_mappings', COUNT(*) FROM product_url_mappings
    UNION ALL SELECT 'product_match_decisions', COUNT(*) FROM product_match_decisions"
  exit 0
fi

# ── MariaDB dump (production before the cutover) ─────────────────────────────
docker compose up -d --wait mariadb
sql() { docker compose exec -T mariadb mariadb -uroot -proot "$@"; }

echo "Recreating MariaDB database 'deals'..."
sql -e "DROP DATABASE IF EXISTS deals; CREATE DATABASE deals CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON deals.* TO 'deals'@'%';"

echo "Importing $dump (this takes a minute)..."
start=$(date +%s)
case "$dump" in
  *.gz) gunzip -c "$dump" ;;
  *)    cat "$dump" ;;
esac | sql --max-allowed-packet=512M deals
echo "Imported in $(( $(date +%s) - start ))s."

echo "Creating the Postgres schema and copying the data..."
reset_postgres
(cd apps/api \
  && DATABASE_URL=$PG_URL bun run db:migrate \
  && MARIADB_URL=mysql://deals:deals@127.0.0.1:3306/deals DATABASE_URL=$PG_URL bun run db:copy-from-mariadb)
