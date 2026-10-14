# Production switch — old repos → deals-platform (final version, one window)

Moves bargah.com.br from the 5 old checkouts on MariaDB to this repo (`main`, i.e. `phase-9`) on PostgreSQL, in **one maintenance window**
(downtime is acceptable). Replaces the phase-by-phase path ([`CUTOVER.md`](./CUTOVER.md) + [`DEPLOY_NOTES.md`](./DEPLOY_NOTES.md),
still useful as reference).

**Before → after**

| | Before | After |
|---|---|---|
| Code | `/var/www/bargah.com.br/{api,crawler,web,ai,messaging}` | `/var/www/bargah.com.br/deals-platform` |
| PM2 | 5 processes | `api.bargah.com.br`, `crawler.bargah.com.br`, `bargah.com.br` |
| Database | MariaDB 10.11 (`bargah_db`) | PostgreSQL 18 + pgvector in Docker (127.0.0.1:5432) |
| Photos | `_media/`, symlinked into crawler and web | `_media/`, written and served by the api (`/media/<file>`) |
| Admin | `/<DASHBOARD_SECRET>/admin` | `/admin` behind a password (`/login`) |

**Safety net:** nothing old is modified or deleted — the old checkouts, their `.env` files and MariaDB stay as they
are. Rolling back = stop the new processes, start the old ones (bottom of this page). Only deals received while the
new version ran would be missing after a rollback.

Throughout: `R=/var/www/bargah.com.br`, `D=$R/deals-platform`.

---

## 0. Prerequisites (any time before)

```sh
# Docker (Amazon Linux 2023)
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user                      # log out and back in
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker run --rm hello-world && docker compose version

# Bun version the repo pins (the running apps keep working on it)
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
bun --version                                          # 1.3.14
```

Check the resources (RAM for Postgres, disk for the data + the vector index ≈ 1.5 GB):

```sh
free -h; df -h /var; nproc
```

---

## 1. Prepare (no downtime — the old system keeps running)

### 1.1 Code

```sh
R=/var/www/bargah.com.br; D=$R/deals-platform
git clone https://github.com/thgoo/deals-platform.git $D
cd $D && bun install --frozen-lockfile     # stays on main (= phase-9 + docs), so scripts/deploy.sh can git pull
ln -s ../_sessions sessions                # crawler's Telegram session (symlink — never copy it)
ls -la sessions/                           # telegram_crawler_session.mtcute.db etc.
```

### 1.2 Postgres

```sh
cd $D/deploy/postgres
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
docker compose up -d && sleep 5 && docker compose ps     # STATUS: healthy
PG_URL="postgres://deals:$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2)@127.0.0.1:5432/deals"
echo "$PG_URL"                                           # keep it for the next steps

cd $D/apps/api && DATABASE_URL=$PG_URL bun run db:migrate
```

### 1.3 Env files

The new apps reuse your current values; only a few lines change.

**api** — start from the old api env, add what came from the merged services:

```sh
cd $D/apps/api
cp $R/api/.env .env
grep -E '^VAPID_' $R/messaging/.env >> .env                          # web push keys
grep -E '^(LLM_PROVIDER|ABACUS_|OPENAI_)' $R/ai/.env >> .env          # AI providers
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"$PG_URL\"#" .env
echo 'MEDIA_DIR=/var/www/bargah.com.br/_media' >> .env
sed -i '/^\(SESSION_SECRET\|MESSAGING_SERVICE_URL\|AI_SERVICE_URL\)=/d' .env
grep -cE '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_EMAIL|OPENAI_API_KEY|LLM_PROVIDER)=' .env   # → 5
grep -E '^(DATABASE_URL|MEDIA_DIR|PORT|NODE_ENV)=' .env | sed 's/:[^:@]*@/:***@/'
```

`NODE_ENV=production` must be there (it was). **Check `WEBHOOK_SECRET` is a real random value** — the crawler's
code falls back to `devsecret`, and the code is public:

```sh
grep -E '^WEBHOOK_SECRET=' .env | sed -E 's/=(.{3}).*/=\1…/'      # must not be devsecret / change-me…
```

**crawler** — unchanged except the photo folder, which it no longer uses:

```sh
cd $D/apps/crawler
cp $R/crawler/.env .env
sed -i '/^MEDIA_DIR=/d' .env
grep -E '^(SESSION_DIR|SESSION_NAME|BACKEND_BASE_URL|TELEGRAM_BACKEND)=' .env
```

`SESSION_DIR` must resolve to the session folder from `apps/crawler`: `./sessions` works (it's a symlink chain to
`_sessions`); an absolute path to `$R/_sessions` works too. `BACKEND_SECRET` stays equal to the api's `WEBHOOK_SECRET`.

**web** — copy the old env file(s), then add the admin login:

```sh
cd $D/apps/web
cp $R/web/.env* .                                   # whatever the old web had (.env, .env.local, .env.production…)
ls -a | grep '^\.env'
grep -h -E '^(NEXT_PUBLIC_BACKEND_URL|INTERNAL_BACKEND_URL)=' .env*      # public api URL / http://localhost:8000
cd $D && bun scripts/hash-admin-password.ts 'choose a long passphrase'    # prints scrypt:…
```

Add to the web env file the old web used for production (e.g. `.env.production` or `.env`):

```sh
ADMIN_PASSWORD_HASH=scrypt:…          # output above
ADMIN_SESSION_SECRET=…                # openssl rand -hex 32
```

`DASHBOARD_SECRET` must still be there (web → api calls) and equal the api's.

### 1.4 Rehearse the data copy

```sh
cd $D/apps/api
MARIADB_URL="$(grep ^DATABASE_URL $R/api/.env | cut -d= -f2- | tr -d '"')" \
DATABASE_URL=$PG_URL bun run db:copy-from-mariadb -- --truncate
```

Must end with **`ALL CHECKS PASSED`**. Note the duration.

### 1.5 Build web

```sh
cd $D/apps/web && bun run build
```

(The build calls the api for `/amzn`; the old api is still running on port 8000, so this works now.)

---

## 2. Switch (downtime starts)

```sh
# 2.1 stop everything bargah (crawler first: no new messages)
pm2 stop crawler.bargah.com.br api.bargah.com.br ai.bargah.com.br messaging.bargah.com.br bargah.com.br

# 2.2 final copy — same command as the rehearsal
cd $D/apps/api
MARIADB_URL="$(grep ^DATABASE_URL $R/api/.env | cut -d= -f2- | tr -d '"')" \
DATABASE_URL=$PG_URL bun run db:copy-from-mariadb -- --truncate        # ALL CHECKS PASSED

# 2.3 replace the PM2 processes (same names, new code)
pm2 delete crawler.bargah.com.br api.bargah.com.br ai.bargah.com.br messaging.bargah.com.br bargah.com.br
cd $D && pm2 start ecosystem.config.cjs --only api.bargah.com.br
pm2 logs api.bargah.com.br --lines 30 --nostream
```

API log must show `Ingestion worker started`. Then:

```sh
curl -s "localhost:8000/api/deals?limit=1" | head -c 200; echo
pm2 start ecosystem.config.cjs --only bargah.com.br
pm2 start ecosystem.config.cjs --only crawler.bargah.com.br
pm2 ls                                                   # 3 bargah processes online
```

---

## 3. Verify

| Check | Expected |
|---|---|
| Site home | deals load, photos show |
| `https://<api domain>/media/<a file in _media>` | 200 `image/jpeg` — if 404 from nginx (not the api), forward `/media/` to the api like `/api/` |
| `https://bargah.com.br/admin` | redirects to `/login`; your passphrase logs in; dashboard loads |
| old `/<secret>/admin` | 404 |
| `pm2 logs crawler.bargah.com.br` | connects to Telegram; `Message received` → `Deal sent to backend` |
| `pm2 logs api.bargah.com.br` | `Message queued` → `Deal created` → `Deal resolved to product`; photos: `Image updated` |
| crawler log on a photo | `Photo uploaded`, and the file appears in `_media` |

When all is green — **downtime over**:

```sh
pm2 save
```

---

## 4. After

**Backups** (daily at 04:15 UTC, 14 days kept):

```sh
sudo mkdir -p /var/backups/deals && sudo chown ec2-user /var/backups/deals
$D/scripts/pg-backup.sh                                   # once by hand → "backup ok"
(crontab -l 2>/dev/null; echo "15 4 * * * $D/scripts/pg-backup.sh >> /home/ec2-user/deals-backup.log 2>&1") | crontab -
```

**Deploying later changes:** `cd $D && scripts/deploy.sh` (pull, install, migrate if needed:
`cd apps/api && bun run db:migrate`, build web, restart).

**In two weeks**, if all is well: take a last MariaDB dump, stop MariaDB, archive the 5 old GitHub repos, remove
`$R/{api,crawler,web,ai,messaging}` (**keep `_media` and `_sessions`**), and the old `media/` (February) folder.

---

## Rollback

Any time during or after the switch:

```sh
pm2 delete crawler.bargah.com.br api.bargah.com.br bargah.com.br
cd $R/api       && pm2 start ~/.bun/bin/bun --name api.bargah.com.br       -- run src/index.ts
cd $R/ai        && pm2 start ~/.bun/bin/bun --name ai.bargah.com.br        -- run src/index.ts
cd $R/messaging && pm2 start ~/.bun/bin/bun --name messaging.bargah.com.br -- run src/index.ts
cd $R/web       && pm2 start ~/.bun/bin/bun --name bargah.com.br           -- run start -- -p 3004
cd $R/crawler   && pm2 start ~/.bun/bin/bun --name crawler.bargah.com.br   -- run src/index.ts
pm2 save
```

MariaDB still has everything up to the moment of the switch. Deals the new version received are only in Postgres.
