# bargah

Telegram deal aggregator: crawls promo channels, extracts and normalizes deals with an LLM, matches them to a
product catalog for price history, and serves them on a web app with push alerts.

| App | What it does | Port |
|---|---|---|
| [`apps/crawler`](apps/crawler) | Listens to Telegram channels, forwards raw messages to the api | — |
| [`apps/api`](apps/api) | Ingestion pipeline, product catalog, feed, alerts, admin API | 8000 |
| [`apps/ai`](apps/ai) | LLM extraction, embeddings, match judge (internal) | 3003 |
| [`apps/messaging`](apps/messaging) | Web push delivery (internal) | 3002 |
| [`apps/web`](apps/web) | Next.js site + admin dashboard | 3000 (prod: 3004) |
| [`packages/shared`](packages/shared) | API contracts shared by crawler, api and web (zod schemas + response types) | — |
| [`packages/config`](packages/config) | Shared tsconfig base and ESLint config | — |

`ai` and `messaging` are scheduled to fold into `api` — see [`docs/REFACTOR_PLAN.md`](docs/REFACTOR_PLAN.md).

## Local development

Requirements: [Bun](https://bun.sh) 1.3+, Docker with Compose.

```sh
bun install
docker compose up -d                      # MariaDB 10.11 (same as prod) on 127.0.0.1:3306
bun scripts/setup-local-env.ts            # creates every app's .env, wired together
```

Then fill in `OPENAI_API_KEY` (and `ABACUS_API_KEY` if `LLM_PROVIDER=abacus`) in `apps/ai/.env`.
Without them `ai` won't start; the feed and dashboard still work, ingestion doesn't.

### Database

Either load a production dump (recommended — real data, ~20s):

```sh
scripts/db-restore.sh path/to/prod-YYYY-MM-DD.sql.gz
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
bun run dev:ai
bun run dev:messaging
bun run dev:api
bun run dev:web           # http://localhost:3000
```

Admin dashboard: `http://localhost:3000/<DASHBOARD_SECRET>/admin` (the setup script prints the URL).

### Test ingestion without Telegram

```sh
bun scripts/send-test-deal.ts
bun scripts/send-test-deal.ts "SSD Kingston NV2 1TB por R\$ 399,90 https://www.amazon.com.br/dp/B0BBWH1R8H"
```

Posts a fake message to `POST /api/deals` exactly like the crawler. It shows up live in the web feed.

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
