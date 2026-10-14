# bargah — refactor plan

Move from 5 repos / 5 services / MySQL to **1 repo / 3 apps / Postgres**, without a big-bang rewrite.

```
Today                                   Target
─────                                   ──────
deals-crawler          ──┐              bargah/                      (Bun workspaces)
deals-backend          ──┤              ├── apps/
deals-ai-service       ──┤   ──────►    │   ├── crawler/   Telegram → api
deals-messaging-service──┤              │   ├── api/       HTTP + worker (two entry points, one codebase)
deals-client-web       ──┘              │   └── web/       Next.js
MySQL                                   ├── packages/
                                        │   ├── shared/    zod contracts + types (crawler↔api↔web)
                                        │   └── config/    tsconfig base, eslint config
                                        ├── docker-compose.yml
                                        └── Postgres (+ pgvector, + pg-boss queue)
```

## Ground rules

1. **One kind of change per phase.** Never move files *and* change behavior in the same step. Never switch database *and* search strategy at the same time.
2. **Every phase ends deployable.** Production keeps running on the result of the last finished phase.
3. **Rollback is written before the phase starts.** For most phases it is "redeploy the previous version"; for the DB cutover it is "point `DATABASE_URL` back at MySQL" (only valid until new writes land in Postgres — see Phase 5).
4. **The old repos stay untouched** until Phase 1 is deployed and stable for a week. Then archive them on GitHub.
5. **Don't add infrastructure the plan doesn't need.** No Redis, Kafka, Kubernetes, or new services. Postgres does storage, vectors, queue and pub/sub.

## Overview

| # | Phase | Risk | Effort* | Depends on |
|---|-------|------|---------|-----------|
| 0 | Safety net | none | 0.5–1 d | — |
| 1 | Monorepo (pure move) | low | 1 d | 0 |
| 2 | Unified tooling + CI ✅ | low | 0.5–1 d | 1 |
| 3 | `packages/shared` contracts ✅ | low | 1 d | 2 |
| 4 | Fold messaging + ai into `api` | low–med | 1–2 d | 3 |
| 5 | MySQL → Postgres | **high** | 3–5 d | 4 |
| 6 | pgvector replaces in-memory search | med | 1 d | 5 |
| 7 | Durable ingestion (raw messages + queue + worker) | med | 3–4 d | 5 (6 recommended) |
| 8 | Media → object storage | low–med | 1 d | 7 |
| 9 | Admin auth | low | 0.5 d | 1 |

\* Focused days for one person. Expect roughly 2–3× calendar time part-time. Total: roughly 2–3 focused weeks.

> **Do now, independent of this plan:** add an auth check inside the admin server actions
> (`deals-client-web/app/[secret]/admin/_actions/cleanup.ts`). It's a live security hole and a 15-minute fix;
> don't wait for Phase 9.

---

## Production today (as of 2026-10-14)

- One EC2 host, **PM2 in fork mode**, user `ec2-user`. The host also runs unrelated sites
  (`assisteai.com.br`, `bloomestudiocriativo.com.br`, `thgo.dev`, `huehue-bot`): **every step must leave those alone.**
- PM2 processes: `api.bargah.com.br`, `bargah.com.br` (web), `crawler.bargah.com.br`, `ai.bargah.com.br`, `messaging.bargah.com.br`.
- **Only `api` and `web` are reachable from the internet.** `ai` and `messaging` are internal only (keep it that way
  until Phase 4 removes them; bun listens on `0.0.0.0` by default, so the security group is what protects them).
- Layout: `/var/www/bargah.com.br/{ai,api,crawler,messaging,web}` + shared `media/` and `sessions/` next to them.
  All Bun apps start as `bun run src/index.ts`; web as `bun run start -- -p 3004`. Env comes from `.env` files in each dir.
- Deploys: `git pull` + `pm2 restart` (+ `bun run build` for web).
- PM2 restart counters are high (api 167, crawler 196) but both report 0 unstable restarts and long uptimes, so
  they're most likely deploys or old crash loops, not an ongoing problem. Still worth a look at `pm2 logs`, since every
  api restart drops in-flight product resolution / alerts (fire-and-forget until Phase 7).
  `api` sits at ~510 MB, mostly the in-memory embedding cache (gone in Phase 6).
- Database: **MariaDB 10.11.19** (not MySQL) on the same host, `127.0.0.1:3306`, database `bargah_db`. Server is aarch64.
  Size on 2026-10-14: 105k deals, 30k products, 27k URL mappings, 104k match decisions; dump ≈ 255 MB gzipped / 1 GB raw.
  MariaDB's `JSON` is an alias for `LONGTEXT`, which is why the code parses JSON columns by hand (`parseDeal` etc.).
- Bun: 1.3.9 in prod, 1.3.14 locally. Align them when convenient (Phase 2).

## Phase 0 — Safety net

**Goal:** be able to run the whole system locally and know when something breaks.

- [x] Working copies match GitHub in every repo (checked 2026-10-14).
- [x] Baseline tests (2026-10-14): api **125 pass / 5 fail** (failures are pre-existing: 3 tests need DB env vars,
      2 resolver tests have mocks that miss `findByProductAndSource`); ai 42/42; crawler 6/6; messaging has no tests.
      Type-check passes everywhere with TypeScript 5.9.
- [x] Production dump taken (2026-10-14, sessions excluded) and restored locally with `scripts/db-restore.sh` (~20 s).
- [x] Recorded the PM2 start command / cwd of each bargah process (see "Production today").
- [x] `docker-compose.yml` with MariaDB 10.11 (apps run natively with bun), `scripts/setup-local-env.ts`,
      `scripts/send-test-deal.ts`. Verified: api boots on prod data (30k products cached in 3.2 s), feed + dashboard respond,
      a test deal goes through the pipeline up to the ai call.
- [x] Full end-to-end test locally (2026-10-14): test deal → extracted (store, price, product, category) → product match
      (`created_new`, top similarity 0.82) → shown in web, in ~1.8 s.
- [ ] Local images: sync a few days of `media/` from the server (see README).

**Done when:** you can run the full pipeline locally against a copy of prod data.

---

## Phase 1 — Monorepo (pure move)

**Goal:** one repo, history preserved, **zero code changes**.

Local work done 2026-10-14 in `bargah.com.br/bargah`:

- [x] Repos imported with full history via `git filter-repo --to-subdirectory-filter apps/<name>` + `merge --allow-unrelated-histories`
      (161 commits; `git log -- apps/api/...` works).
      Mapping: `deals-backend → apps/api`, `deals-crawler → apps/crawler`, `deals-client-web → apps/web`,
      `deals-ai-service → apps/ai` (temporary), `deals-messaging-service → apps/messaging` (temporary).
- [x] Root `package.json` (workspaces + `dev:*`, `test`, `lint` scripts), root `.gitignore`.
- [x] Packages renamed `@bargah/{api,crawler,web,ai,messaging}`; `test:bun` → `test` in api and ai.
- [x] One root `bun.lock`. A fresh install drifted to newer versions (Next 16.4, React 19.3, hono 4.13, zod 4.6, mtcute 0.27.9),
      so root `overrides` **pin every runtime dep to what the old lockfiles had**. Remove the overrides deliberately in Phase 2.
      Note: `deals-backend` never had a lockfile, so prod api versions were whatever was installed at deploy time.
- [x] Shared runtime dirs moved to the repo root: `apps/crawler/{media,sessions}` → `../../{media,sessions}`,
      `apps/web/public/media` → `../../../media`. On the server, `bargah/media` and `bargah/sessions` must exist
      (move the current directories there, or symlink them).
- [x] Verified: tests match the baseline, type-check passes, `web` compiles. (`next build` needs the api running,
      because `/amzn` fetches it at prerender time — same as before.)
- [x] `ecosystem.config.cjs` for the 5 bargah processes — same PM2 names, commands and ports, `cwd: apps/<name>`.
- [x] `scripts/deploy.sh [app...]` — pull, install, build web if included, restart, `pm2 save`.
- [x] Cutover runbook: [`docs/CUTOVER.md`](./CUTOVER.md) (one process at a time, per-process rollback, never two crawlers).
- [ ] Create `github.com/thgoo/bargah` and push.
- [ ] Run the cutover on the server.

**Done when:** production runs from the monorepo and nothing else changed.
**Rollback:** per process, point PM2 back at the old directory and restart (keep the old checkouts on the server until Phase 2).

---

## Phase 2 — Unified tooling + CI ✅ (tag `phase-2`)

**Goal:** one way to type-check, lint and test.

- [x] `packages/config` (`@bargah/config`): `tsconfig.base.json` + one ESLint config for the bun apps. `baseUrl` replaced
      by relative `paths` (TypeScript 6 compatible). Web keeps its own Next.js config.
- [x] Every bun app declares `typescript`, `eslint`, `@types/bun ^1.3.14`, `@bargah/config`; scripts `lint`, `typecheck`, `test`.
      Unused `tsx`, `@types/jest`, `@types/node` removed. Crawler's dead `tsc` / `node dist` scripts removed.
- [x] Lint clean everywhere. Web: Prettier owns formatting (the overlapping @stylistic rules made `--fix` loop);
      `react-hooks/set-state-in-effect` is a warning for `useAlerts` / `usePriceHistory` (revisit with SWR).
      Messaging has no lint/test: it's deleted in Phase 4.
- [x] The 5 failing api tests fixed (stub missing `findByProductAndSource`; `.env.test` for suites that import config).
- [x] Overrides removed; explicit upgrades: hono 4.13, zod 4.6, @hono/zod-validator 0.9, next 16.4, react 19.3.
      **mtcute stays at 0.27.5** until it can be tested against Telegram.
- [x] `bun run check` = typecheck + lint + test across workspaces. GitHub Actions runs the same on push/PR (bun 1.3.14),
      verified in a clean checkout without `.env` files.
- [ ] **Production:** upgrade bun 1.3.9 → 1.3.14 on the server before deploying this phase (see CUTOVER.md).

Known gap: `next build` isn't in CI (it prerenders `/amzn` against a live api, and needs `media/` to exist —
the `/api/media` route goes away in Phase 8).

---

## Phase 3 — `packages/shared` contracts ✅ (tag `phase-3`)

**Goal:** stop defining the same shapes twice.

- [x] `@bargah/shared/ingest`: crawler → api zod schemas (`createDealSchema`, `updateImageSchema`, `mediaSchema`);
      api validates with them, crawler types its payloads from them. The media schema now matches what the crawler sends.
- [x] `@bargah/shared` deals / alerts / dashboard response types (`DealDto`, `DealsPageDto`, `AlertDto`, …),
      dates as ISO strings. The api returns these types (Date → `toIsoString`), web imports them.
      JSON verified identical to `phase-2` on 12 endpoints.
- [x] Fixed on the way: web typed `chatId` as a number (api sends a string).
- Logger/retry stay per app until Phase 4 leaves only api + crawler.

---

## Phase 4 — Fold `messaging` and `ai` into `api`

**Goal:** 5 deployables → 3. Behavior unchanged.

### 4a. Messaging (small)
- [ ] Move `apps/messaging/src/channels/web-push.ts` → `apps/api/src/notifications/web-push.ts`. Drop the dispatcher/channel registry; one function `sendWebPush(subscription, message): Promise<SendResult>`.
- [ ] `AlertService.sendNotification` calls it directly instead of `fetch(MESSAGING_SERVICE_URL/notify)`.
- [ ] Move `VAPID_*` env vars into api's zod config; delete `MESSAGING_SERVICE_URL`.
- [ ] Deploy, verify that a push arrives, delete `apps/messaging`.

### 4b. AI
- [ ] Move `apps/ai/src/{capabilities,providers,shared/errors.ts,shared/retry.ts}` → `apps/api/src/ai/`.
- [ ] Turn `AiServiceClient` into an interface (`embed`, `judge`, `extract`) with two implementations:
  `HttpAiService` (the current one) and `InProcessAiService` (calls the orchestrators directly).
  Deploy with the in-process one selected in `index.ts`. Callers and tests don't change.
- [ ] Move `OPENAI_*` / `ABACUS_*` / `LLM_PROVIDER` into api's config. Delete `AI_SERVICE_URL`.
- [ ] Remove the 120s client timeout layer; the provider timeouts and retries are the only ones left.
- [ ] Merge the copies of the logger and retry code into one in `api` (crawler keeps its own or imports from `shared`, your call).
- [ ] Deploy, watch extraction/match logs for a day, then delete `HttpAiService` and `apps/ai`.

**Done when:** production runs `crawler`, `api`, `web` only.
**Rollback:** select `HttpAiService` again and redeploy `apps/ai` (keep it around until stable).

---

## Phase 5 — MariaDB → Postgres

**Goal:** same behavior on Postgres. **Not** in this phase: pgvector search, queue, schema redesign.

### 5a. Upgrade drizzle on MySQL first
- [ ] `drizzle-orm` 0.36 → current, `drizzle-kit` to match, **still on MySQL**. Fix any API changes and deploy.
  This isolates "drizzle changed" from "database changed".

### 5b. Port schema + code (on a branch, against local Postgres)
- [ ] Add Postgres 16+ with the `vector`, `pg_trgm` and `unaccent` extensions to `docker-compose.yml` (image `pgvector/pgvector:pg16` or newer).
- [ ] Schema files `mysqlTable` → `pgTable`:

  | MySQL | Postgres |
  |---|---|
  | `bigint unsigned autoincrement` | `bigint().generatedAlwaysAsIdentity()` |
  | `varchar(36)` ids | `uuid()` |
  | `timestamp` | `timestamp({ withTimezone: true })` |
  | `json` | `jsonb` |
  | `mysqlEnum` | `pgEnum` |
  | `embedding json` | `vector(1536)` (search stays in-memory until Phase 6) |
  | FULLTEXT `search_idx` | GIN `pg_trgm` index on the searched columns |

- [ ] **Fresh baseline migration** (`drizzle/` restarts at `0000`). Don't port the MySQL history; archive the old migration folder.
- [ ] Add constraints you want anyway while the schema is fresh:
  - `UNIQUE (chat, message_id)` on `deals` (the copy script must remove duplicates first)
  - `ON DELETE CASCADE` on `product_match_decisions.deal_id` (then `deleteDeal` no longer needs to delete decision rows by hand)
- [ ] Fix the MySQL-specific code (counted 2026-10-14):
  - `insertId` + re-select (2) → `.returning()`
  - `affectedRows` / `drizzleAffectedRows` (22 hits, 4 files) → `.returning({ id })` length or `rowCount`
  - `COLLATE utf8mb4_unicode_ci` LIKE (5) → `unaccent(col) ILIKE unaccent($1)`
  - `.ignore()` (1) → `.onConflictDoNothing()`
  - MySQL date/JSON functions (12 hits, 6 files) → `date_trunc`, `now() - interval`, `->>`
  - Raw `` sql` `` fragments (42 hits, 11 files): review each. Watch for backtick quoting and `GROUP BY` differences (Postgres is strict about non-aggregated columns).
  - Delete the `parseDeal` / `parse` / `parseAlert` JSON-string workarounds.
- [ ] `scripts/`: port `backfill-product-catalog` and `audit-catalog`. The one-off scripts (`migrate-terabyte-url-mappings`, `split-overmerged-products`, `unlink-outlier-deals`, `cleanup-catalog`) are done — don't port them; git history keeps them.
- [ ] All tests green against Postgres.

### 5c. Data copy script
- [ ] `apps/api/scripts/mysql-to-pg.ts`: reads MySQL in batches and writes Postgres in FK order:
  `users → sessions → products → deals → product_url_mappings → product_match_decisions → alerts`.
- [ ] Gotchas to handle:
  - **Identity sequences:** after copying explicit ids, `SELECT setval(pg_get_serial_sequence('deals','id'), max(id)) FROM deals;` (per table) or inserts will collide.
  - **Timezones:** check how mysql2 returns `timestamp` (server/session TZ) and store UTC. Spot-check a few `ts` values in both databases.
  - **JSON stored as strings:** parse before inserting into `jsonb`.
  - **Embeddings:** JSON array → `vector`.
  - **Duplicate deals:** keep the lowest id per `(chat, message_id)` and repoint `product_match_decisions` to it.
- [ ] Verification query set: row counts per table, `sum(price)`, a few price histories, and product counts per category. Compare MySQL vs Postgres.
- [ ] **Rehearse the full copy at least twice** on the Phase 0 dump and time it.

### 5d. Cutover runbook
1. Announce nothing (single operator) — but pick a quiet hour.
2. Stop the **crawler** (Telegram buffers channel updates; confirm in rehearsal that mtcute catches up on restart, or accept losing a few minutes of deals).
3. Stop `api` writes (stop the process).
4. Run the copy script → run the verification queries.
5. Switch `DATABASE_URL` → start `api` → smoke test: feed loads, dashboard loads, post a test deal.
6. Start the crawler.
7. Keep MySQL running read-only for 2 weeks, then dump and shut it down.

**Rollback:** before step 6, point `DATABASE_URL` back to MySQL and restart. After new deals land in Postgres, rollback means losing them — so do the smoke test properly in step 5.

---

## Phase 6 — pgvector replaces the in-memory search

- [ ] HNSW index: `CREATE INDEX ON products USING hnsw (embedding vector_cosine_ops);`
- [ ] New `CandidateSearchService.findSimilar` = one query:
  `SELECT id, canonical_name, 1 - (embedding <=> $1) AS score FROM products ORDER BY embedding <=> $1 LIMIT 5`.
  It becomes `async`; the resolver awaits it.
- [ ] Remove `loadAll()` from startup, `addProduct()`, and the cache. Renames/cleanups are now visible immediately.
- [ ] Before switching, run both implementations side by side on ~200 recent deals and compare the top-5. Scores should match to ~3 decimals; HNSW is approximate, so small ordering differences are fine.
- [ ] `updateProductName` should re-embed the new name (now trivial: one `embed` call + update).

**Done when:** the api starts instantly and holds no catalog state in memory.

---

## Phase 7 — Durable ingestion

**Goal:** the crawler gets an instant answer; processing is retryable, survives restarts, and is idempotent.

### Data
```
raw_messages
  id            bigint identity
  chat          text            ┐ UNIQUE
  message_id    bigint          ┘
  payload       jsonb           (exact crawler payload, validated by packages/shared)
  photo_path    text null       (filled by the image endpoint, whatever order things arrive in)
  status        enum(pending, processed, skipped, failed)
  skip_reason   text null
  deal_id       bigint null → deals.id
  attempts      int
  received_at   timestamptz
```
`deals` gets `raw_message_id UNIQUE` → a retried job cannot create a second deal.

### Flow
```
crawler ── POST /api/ingest/messages ──► INSERT raw_messages ON CONFLICT DO NOTHING
                                         enqueue process-message(raw_id) ──► 202 (~10 ms)

worker (apps/api/src/worker.ts, pg-boss):
  process-message(raw_id)    links → extract → create deal (idempotent on raw_message_id)
                             → NOTIFY deal_created → enqueue resolve-product(deal_id)
  resolve-product(deal_id)   concurrency = 1  → no duplicate products from concurrent deals
                             → enqueue notify-alerts(deal_id)
  notify-alerts(deal_id)     runs after resolution → price gate per (alert, product_id)

api (apps/api/src/index.ts):
  LISTEN deal_created / image_updated → SSE to browsers
```

### Steps
- [ ] Add pg-boss; `worker.ts` entry point; `bun run worker` script; run it as its own process.
- [ ] New ingest endpoint + `raw_messages`. **Keep `POST /api/deals` working** until the crawler is switched.
- [ ] Image endpoint writes `photo_path` on `raw_messages` (and on the deal if it already exists). Arrival order no longer matters → delete the "wait for deal POST before sending the media notification" gating in the crawler.
- [ ] Crawler: point at the new endpoint and drop the timeout from 180s to ~10s. Retries are now safe.
- [ ] SSE via `LISTEN/NOTIFY` (the in-process `EventEmitter` can't see events from the worker process).
- [ ] Reprocessing = `UPDATE raw_messages SET status='pending'` + enqueue. Retire the reprocess scripts.
- [ ] Sweep job (cron in pg-boss): re-enqueue `pending` older than 10 min and deals with no match decision.
- [ ] Remove `POST /api/deals` once the crawler has run on the new path for a week.

**Done when:** you can kill the api or worker mid-flight and nothing is lost or duplicated.

---

## Phase 8 — Media → object storage

Today crawler and web share `../media` via symlinks, which ties them to one machine.

- [ ] Choose: Cloudflare R2 (no egress fees) or S3. Or, simplest: the crawler POSTs image bytes to the api, the api stores them, and a CDN sits in front.
- [ ] Crawler uploads after download; the image endpoint stores the **object key**, not a local path.
- [ ] Web renders a CDN URL. Delete `apps/web/app/api/media/route.ts` and the symlinks.
- [ ] One-off: upload the existing `media/` folder and rewrite the `local_path` values.

---

## Phase 9 — Admin auth

Can be done any time after Phase 1.

- [ ] Replace the `[secret]` URL slug with a real login: one admin user (env-configured password hash) + session cookie (reuse `SessionService`), **or** put `/admin` behind Cloudflare Access.
- [ ] Server actions check the session inside every action.
- [ ] Delete public `/api/auth/register` (and the `users.document` column) unless you plan end-user accounts.

---

## Explicitly out of scope

- Rewriting in another language.
- Microservices, Redis, Kafka, Kubernetes.
- Redesigning the matching algorithm (thresholds, judge prompt) — separate work, ideally after you have a labeled test set (see below).
- UI changes in `web`.

## Recommended follow-up (after Phase 7)

**Labeled test set for the AI.** ~200 real raw messages with hand-checked extractions + ~100 labeled product pairs (same / different). A `bun run eval` that scores extraction and matching. Run it before any prompt or threshold change. Phase 7's `raw_messages` table makes collecting these trivial.

## Open questions (answer before the phase that needs them)

| Question | Needed by |
|---|---|
| ~~Where does production run / how are deploys done?~~ Answered — see "Production today". | 1 |
| ~~Where does the DB run?~~ MariaDB 10.11 on the same host. | 5 |
| ~~Production DB size?~~ ~105k deals / 30k products (2026-10-14): the copy takes minutes, not hours. | 5 |
| Managed Postgres (Neon / Supabase / RDS) or self-hosted next to the apps? Must support `pgvector`. | 5 |
| Acceptable downtime for the cutover (minutes? an hour?) | 5 |
| Does mtcute deliver missed channel messages after a restart? (verify in rehearsal) | 5, 7 |
| R2 vs S3 vs api-stored images? | 8 |
| Do you want end-user accounts someday? (decides whether `/api/auth` survives) | 9 |
