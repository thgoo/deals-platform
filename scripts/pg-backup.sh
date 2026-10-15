#!/usr/bin/env bash
# Daily Postgres backup for production (custom format, restorable with pg_restore
# or `scripts/db-restore.sh <file>.dump` locally). Keeps the last KEEP_DAYS days.
#
#   scripts/pg-backup.sh                       # writes to $BACKUP_DIR (default /var/backups/deals)
#
# Cron (as ec2-user), every day at 04:15 UTC:
#   15 4 * * * /var/www/bargah.com.br/deals-platform/scripts/pg-backup.sh >> $HOME/deals-backup.log 2>&1
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/deals}
KEEP_DAYS=${KEEP_DAYS:-14}
COMPOSE_DIR=${COMPOSE_DIR:-"$(cd "$(dirname "$0")/../deploy/postgres" && pwd)"}

mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/deals-$(date -u +%Y-%m-%dT%H%M).dump"

# shellcheck disable=SC2016 # variables expand inside the container
docker compose --project-directory "$COMPOSE_DIR" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.partial"
mv "$file.partial" "$file"

find "$BACKUP_DIR" -name 'deals-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
