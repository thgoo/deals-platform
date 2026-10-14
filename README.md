# bargah

Telegram deal aggregator: crawls promo channels, extracts and normalizes deals with an LLM, matches them to a
product catalog for price history, and serves them on a web app with push alerts.

| App | What it does | Port |
|---|---|---|
| [`apps/crawler`](apps/crawler) | Listens to Telegram channels, forwards raw messages to the api | — |
| [`apps/api`](apps/api) | Ingestion pipeline (incl. LLM extraction), product catalog, feed, alerts + web push, admin API | 8000 |
| [`apps/web`](apps/web) | Next.js site + admin dashboard | 3000 (prod: 3004) |
| [`packages/shared`](packages/shared) | API contracts shared by crawler, api and web (zod schemas + response types) | — |
| [`packages/config`](packages/config) | Shared tsconfig base and ESLint config | — |

See [`docs/REFACTOR_PLAN.md`](docs/REFACTOR_PLAN.md) for the ongoing refactor.

## Local development

Requirements: [Bun](https://bun.sh) 1.3+, Docker with Compose.

```sh
bun install
docker compose up -d                      # Postgres 18 + pgvector (same as prod) on 127.0.0.1:5432
bun scripts/setup-local-env.ts            # creates every app's .env, wired together
```

Then fill in `OPENAI_API_KEY` (and `ABACUS_API_KEY` if `LLM_PROVIDER=abacus`) in `apps/api/.env`.
Without them the feed and dashboard still work; ingesting new deals doesn't.
Re-run the setup script after pulling: it adds settings new versions need, without touching existing values.

### Database

PostgreSQL 18 with pgvector (`docker compose up -d` starts it on 127.0.0.1:5432).
MariaDB is still in the compose file only to read old dumps.

Load a production dump (recommended — real data, ~1 min):

```sh
scripts/db-restore.sh path/to/prod.dump            # Postgres backup (scripts/pg-backup.sh output)
scripts/db-restore.sh path/to/prod-YYYY-MM-DD.sql.gz  # old MariaDB dump: imported, then copied into Postgres
```

or start empty:

```sh
cd apps/api && bun run db:migrate
```

Dumps contain personal data (alert push subscriptions). Keep them outside the repo, or in `.data/` (gitignored).

### Images

Deal photos live in `media/` at the repo root (gitignored; crawler writes, web serves). Locally it starts empty,
so photos don't load. To get recent ones from production:

```sh
mkdir -p media
ssh <server> 'cd /var/www/bargah.com.br/media && find . -maxdepth 1 -type f -mtime -3' > /tmp/recent-media.txt
rsync -av --files-from=/tmp/recent-media.txt <server>:/var/www/bargah.com.br/media/ media/
rsync -av <server>:/var/www/bargah.com.br/media/coupon.png media/    # image used by coupon-only deals
```

### Run

One terminal per app:

```sh
bun run dev:api
bun run dev:web           # http://localhost:3000
```

Admin dashboard: `http://localhost:3000/<DASHBOARD_SECRET>/admin` (the setup script prints the URL).

### How ingestion works

`POST /api/deals` (from the crawler) stores the raw message in `raw_messages` and answers immediately. A worker
inside the api drains that table: **extract** (link pipeline + LLM → deal) → **resolve** (product matching, one at a
time) → **notify** (keyword alerts). Failed steps retry with backoff; a crash mid-step is picked up again after a
5-minute lease. See [`apps/api/src/ingest`](apps/api/src/ingest).

### Test ingestion without Telegram

```sh
bun scripts/send-test-deal.ts
bun scripts/send-test-deal.ts "SSD Kingston NV2 1TB por R\$ 399,90 https://www.amazon.com.br/dp/B0BBWH1R8H"
```

Posts a fake message to `POST /api/deals` exactly like the crawler; the worker processes it a few seconds later and
it shows up live in the web feed.

### ⚠️ Running the crawler locally

**Do not run it with the production Telegram session.** Two clients on the same session can get it revoked,
which takes the production crawler down. Use a separate Telegram account: put its `TG_API_ID` / `TG_API_HASH`
in `apps/crawler/.env`, run `cd apps/crawler && bun run setup` once, then `bun run dev:crawler`.
For most work, `scripts/send-test-deal.ts` is enough.

### Checks

```sh
bun run check        # typecheck + lint + test, all workspaces (same as CI)
```

## Production

Single host, PM2 ([`ecosystem.config.cjs`](ecosystem.config.cjs)). Deploy with `scripts/deploy.sh [app...]`.
Moving production onto this repo: [`docs/CUTOVER.md`](docs/CUTOVER.md).
