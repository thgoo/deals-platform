# Deploying the refactor to production, phase by phase

Each phase ends with a git tag (`phase-1`, `phase-2`, …). Deploy them **in order**, one at a time,
and let each run for a while before the next. Phase 1 has its own runbook: [`CUTOVER.md`](./CUTOVER.md).

General procedure for every phase after the cutover:

```sh
cd /var/www/bargah.com.br/bargah
git fetch --tags
git checkout phase-N          # detached HEAD on the tag is fine
# … the phase-specific steps below …
bun install --frozen-lockfile
scripts/deploy.sh <apps>      # note: deploy.sh runs `git pull`; on a tag use the manual restart below instead
```

Manual restart without pulling (when sitting on a tag):

```sh
(cd apps/web && bun run build)              # only if web changed
pm2 restart api.bargah.com.br crawler.bargah.com.br bargah.com.br --update-env
```

Rollback = `git checkout phase-(N-1)`, redo the phase N-1 steps that changed config, restart.

---

## Phase 2 — tooling and dependency upgrades

Apps restarted: api, crawler, web.

1. Upgrade bun to the version the repo pins:
   ```sh
   curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
   bun --version   # 1.3.14
   ```
2. Checkout `phase-2`, `bun install --frozen-lockfile`, build web, restart api, crawler, web.
3. Check: site loads, a new deal arrives (`pm2 logs api.bargah.com.br`), admin dashboard loads.

No config changes. Upgrades in this phase: hono 4.13, zod 4.6, next 16.4, react 19.3.

## Phase 3 — shared contracts

Apps restarted: api, crawler, web. No config changes.
The api's JSON was verified identical to phase 2, so this is a plain deploy.

## Phase 4 — messaging and ai folded into api

After this phase production runs **3 processes**: api, crawler, web.

1. **Before deploying**, add the merged services' settings to the api env. On the server:
   ```sh
   cd /var/www/bargah.com.br
   API_ENV=bargah/apps/api/.env
   # web push (from the messaging service)
   grep -E '^VAPID_' messaging/.env >> $API_ENV
   # AI providers (from the ai service)
   grep -E '^(LLM_PROVIDER|ABACUS_|OPENAI_)' ai/.env >> $API_ENV
   grep -E '^(VAPID_|LLM_PROVIDER|ABACUS_|OPENAI_)' $API_ENV | sed -E 's/=.{4}.*/=…/'   # check they're there
   ```
   `MESSAGING_SERVICE_URL` and `AI_SERVICE_URL` are no longer read; you can delete them.
2. Checkout `phase-4`, `bun install --frozen-lockfile`, restart **api** (crawler/web unchanged in behavior,
   restart them too to pick up the new lockfile).
3. Check in `pm2 logs api.bargah.com.br`: on the first deal, `LLM provider initialized`,
   `Extraction completed`, `Embedding provider initialized`, `Deal resolved to product`.
   Alerts: the next matching deal logs `Alert notification sent`.
4. Only then stop the old services and persist:
   ```sh
   pm2 delete ai.bargah.com.br messaging.bargah.com.br
   pm2 save
   ```

Rollback: checkout `phase-3`, restart api, and start ai/messaging again from their phase-3 commands
(`pm2 start ecosystem.config.cjs --only ai.bargah.com.br` on the phase-3 checkout).

## Phase 5 — MariaDB → PostgreSQL

The one phase with a real data migration. Rehearse it first (step 3), then do the cutover in a quiet hour.
Downtime: a few minutes (the copy of ~300k rows takes ~25 s locally).

### 1. Install Docker and start Postgres (no impact on production)

Amazon Linux 2023:

```sh
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user          # log out and back in
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

Then, from the repo checked out at `phase-5`:

```sh
cd /var/www/bargah.com.br/bargah/deploy/postgres
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
docker compose up -d
docker compose ps                          # healthy
```

### 2. Create the schema

```sh
cd /var/www/bargah.com.br/bargah/apps/api
PG_URL="postgres://deals:$(grep ^POSTGRES_PASSWORD ../../deploy/postgres/.env | cut -d= -f2)@127.0.0.1:5432/deals"
DATABASE_URL=$PG_URL bun run db:migrate
```

### 3. Rehearsal (production keeps running on MariaDB)

```sh
MARIADB_URL="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')" \
DATABASE_URL=$PG_URL bun run db:copy-from-mariadb -- --truncate
```

Must end with `ALL CHECKS PASSED`. Note how long it took.

### 4. Cutover

1. Stop the crawler first, then the api (nothing writes to MariaDB anymore):
   ```sh
   pm2 stop crawler.bargah.com.br api.bargah.com.br
   ```
2. Final copy, same command as the rehearsal (`--truncate` replaces the rehearsal data). Must say `ALL CHECKS PASSED`.
3. Point the api at Postgres — edit `apps/api/.env`:
   ```sh
   cp .env .env.mariadb.bak
   sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"$PG_URL\"#" .env
   ```
4. Deploy the `phase-5` code and start the api, then check it before starting the crawler:
   ```sh
   bun install --frozen-lockfile
   pm2 restart api.bargah.com.br --update-env && pm2 logs api.bargah.com.br --lines 30
   curl -s "localhost:8000/api/deals?limit=1" | head -c 200
   ```
   Site feed, admin dashboard, product page and search must load.
5. Start the crawler; watch the first deals arrive (`Deal created`, `Deal resolved to product`):
   ```sh
   pm2 restart crawler.bargah.com.br && pm2 logs api.bargah.com.br
   ```
6. Rebuild and restart web (nothing changed in it, but it's on the new lockfile), `pm2 save`.

### 5. Backups

```sh
sudo mkdir -p /var/backups/deals && sudo chown ec2-user /var/backups/deals
/var/www/bargah.com.br/bargah/scripts/pg-backup.sh          # run once by hand
crontab -e
# 15 4 * * * /var/www/bargah.com.br/bargah/scripts/pg-backup.sh >> /home/ec2-user/deals-backup.log 2>&1
```

Copy a backup off the server now and then (e.g. `scp` it to your machine; `scripts/db-restore.sh file.dump` restores it locally).

### Rollback

- **Before step 5** (no new deals in Postgres yet): `cp .env.mariadb.bak .env`, checkout `phase-4`, restart api, start crawler.
- **After new deals landed in Postgres**: rolling back loses them. Prefer fixing forward; if you must roll back,
  those deals can be re-sent from Telegram history only by hand.

Keep MariaDB running (read-only, untouched) for two weeks, then take a last dump and stop it.

### Known, accepted differences

- Malformed dates are gone: a few dashboard endpoints used to send `"2026-10-14 20:00:00"` (no timezone, browsers
  read it as local time); everything is ISO 8601 UTC now.
- Percentiles on an exact .5 midpoint can differ by 1 cent (floating point in `percentile_cont`).
- The 2 duplicate deals in the data are dropped by the copy; `(chat, message_id)` is unique now.
