#!/usr/bin/env bash
# Pull, install, build web if needed, restart the given PM2 apps.
#
#   scripts/deploy.sh                      # restart every bargah app
#   scripts/deploy.sh api web              # only these (short names: api crawler web)
set -euo pipefail

cd "$(dirname "$0")/.."

declare -A PM2_NAME=(
  [api]=api.bargah.com.br
  [crawler]=crawler.bargah.com.br
  [web]=bargah.com.br
)

apps=("$@")
[ ${#apps[@]} -eq 0 ] && apps=(api crawler web)

for a in "${apps[@]}"; do
  [ -n "${PM2_NAME[$a]:-}" ] || { echo "unknown app: $a" >&2; exit 1; }
done

git pull --ff-only
bun install --frozen-lockfile

# Build before restarting anything: a failed build leaves every app on the old code.
for a in "${apps[@]}"; do
  if [ "$a" = web ]; then
    (cd apps/web && bun run build)
  fi
done

for a in "${apps[@]}"; do
  pm2 restart "${PM2_NAME[$a]}" --update-env
done

pm2 save
