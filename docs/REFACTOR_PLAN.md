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
| 0 | Safety net ✅ | none | 0.5–1 d | — |
| 1 | Monorepo (pure move) ✅ local | low | 1 d | 0 |
| 2 | Unified tooling + CI ✅ | low | 0.5–1 d | 1 |
| 3 | `packages/shared` contracts ✅ | low | 1 d | 2 |
| 4 | Fold messaging + ai into `api` ✅ | low–med | 1–2 d | 3 |
| 5 | MariaDB → Postgres ✅ | **high** | 3–5 d | 4 |
| 6 | pgvector replaces in-memory search ✅ | med | 1 d | 5 |
| 7 | Durable ingestion (raw messages + queue + worker) ✅ | med | 3–4 d | 5 (6 recommended) |
| 8 | Media stored and served by api | low–med | 1 d | 7 |
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
  `api` sits at ~510 MB, mostly the in-memory embedding cache (gone in Phase 6: ~110 MB).
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

## Phase 4 — Fold `messaging` and `ai` into `api` ✅ (tag `phase-4`)

**Goal:** 5 deployables → 3. Behavior unchanged.

- [x] Messaging: `WebPushSender` (`apps/api/src/notifications`) replaces the HTTP call; VAPID keys in api config,
      applied lazily on the first send. Unit-tested (VAPID once, 404/410 → `recipient_gone`).
- [x] AI: orchestrators, prompts, schemas and providers moved to `apps/api/src/ai` with `git mv` (history kept).
      `AiService` interface + `InProcessAiService` replace `AiServiceClient` everywhere. Providers are created on
      first use; requests are validated with the same schemas the HTTP routes used. The 120 s client timeout layer
      is gone. Verified end to end (extract → embed → judge → resolved) against the real providers.
- [x] `apps/messaging` and `apps/ai` removed; PM2 ecosystem, deploy script, README updated.
- [x] `scripts/setup-local-env.ts` appends new keys to existing env files and carries settings over from the
      retired apps' env files.
- Logger/retry: api now has one copy of each; the crawler keeps its own (different retry semantics on purpose).
- Deferred: removing the `HttpAiService` rollback path wasn't needed — rollback is "deploy `phase-3`".

Production steps: [`DEPLOY_NOTES.md`](./DEPLOY_NOTES.md#phase-4--messaging-and-ai-folded-into-api).

---

## Phase 5 — MariaDB → PostgreSQL ✅ (tag `phase-5`)

**Goal:** same behavior on Postgres. Not in this phase: pgvector search, queue, schema redesign.

- [x] 5a. drizzle-orm 0.36 → 0.45 / drizzle-kit 0.28 → 0.31 **on MariaDB first** (JSON verified identical).
- [x] Postgres **18** + pgvector (`pgvector/pgvector:pg18`) locally and in `deploy/postgres/` for production.
      18 is required: human-text columns (store, product, description, text, category, canonical_name) use a
      nondeterministic ICU collation `ci_ai`, which reproduces MariaDB's case- and accent-insensitive `=`,
      `LIKE` and `GROUP BY` ("Amazon" = "AMAZON", "Você" = "Voce"); `LIKE` on it needs PG 18. Ids/URLs stay exact.
- [x] Schema: uuid ids for products/alerts, `bigint` identity for the rest, `timestamptz`, `jsonb`, pg enums,
      `vector(1536)` embeddings. New: **`UNIQUE (chat, message_id)`** on deals (ingestion is idempotent; a racing
      duplicate POST returns `deduped`), **`ON DELETE CASCADE`** for match decisions, index on decisions.created_at.
      Fresh migration baseline (`drizzle/0000_setup.sql` creates the extension + collation).
- [x] Code: `RETURNING` instead of insert-then-select and `affectedRows`; `onConflictDoNothing` instead of
      `INSERT IGNORE`; percentiles as ordered-set aggregates; MariaDB JSON-string workarounds removed.
      Malformed uuids from requests behave as "not found" (`isUuid`), like before.
- [x] **Fixed on the way:** admin product explorer sorting by p10 / median / spread (failed with
      `Unknown column` in production); dashboard timestamps that weren't ISO 8601.
- [x] `scripts/mariadb-to-postgres.ts` (`bun run db:copy-from-mariadb`): FK-ordered keyset copy, drops the
      2 duplicate deals (repointing their decisions), sets identity sequences, verifies counts / sums / timestamps /
      store grouping. Rehearsed locally: 304k rows in ~23 s, all checks pass.
- [x] Verified: JSON identical to `phase-4` on MariaDB for 19/30 endpoints; every difference explained
      (see DEPLOY_NOTES "Known, accepted differences"). Write paths, concurrency dedupe, cascade delete, alerts,
      SSE exercised against Postgres.
- [x] `scripts/pg-backup.sh` (daily `pg_dump -Fc`, 14-day retention) — backup → restore round trip verified.
- [x] One-off scripts not ported (cleanup-catalog, unlink-outlier-deals, split-overmerged-products,
      migrate-terabyte-url-mappings); still in git history.
- Found on the way: locally (TZ America/Sao_Paulo) mysql2 read MariaDB timestamps 3 h off; production (UTC) was fine.
  The copy reads them as UTC regardless.

Production steps: [`DEPLOY_NOTES.md`](./DEPLOY_NOTES.md#phase-5--mariadb--postgresql).

---

## Phase 6 — pgvector replaces the in-memory search ✅ (tag `phase-6`)

- [x] HNSW index `products_embedding_hnsw_idx` (`vector_cosine_ops`); migration sets `maintenance_work_mem = 256MB`
      for the build (11 s locally for 30k products, 232 MB index).
- [x] `CandidateSearchService.findSimilar` is one query (`ORDER BY embedding <=> $1 LIMIT k`) with
      `hnsw.ef_search = 100`. Parity with the in-memory search on 300 products: identical top-1 score every time;
      id differences are ties between the 480 products that share an identical embedding (catalog duplicates).
- [x] `loadAll()` / `addProduct()` / the cache are gone: api ready in 0.5 s (was 6.6 s), RSS 108 MB (was 403 MB).
- [x] Renaming a product re-embeds the new name.
- Exact scan would also work today (~200 ms per query) but grows with the catalog; HNSW stays ~2–5 ms.

Production steps: [`DEPLOY_NOTES.md`](./DEPLOY_NOTES.md#phase-6--pgvector-search).

---

## Phase 7 — Durable ingestion ✅ (tag `phase-7`)

**Goal:** the crawler gets an instant answer; processing is retryable, survives restarts, and is idempotent.

Built simpler than first planned: **no pg-boss and no separate worker process.** `raw_messages` already is a
durable queue, so a small worker claims rows with `FOR UPDATE SKIP LOCKED` + a lease. It runs inside the api
process, which keeps the SSE stream in-process (no `LISTEN/NOTIFY` needed) and the deployment unchanged.
`SKIP LOCKED` makes several api processes safe should that ever happen.

- [x] `raw_messages`: unique `(chat, message_id)`, payload, photo id/path, `step` (extract → resolve → notify → done),
      outcome / skip reason, attempts, backoff (`available_at`), lease (`locked_until`), stored external ids.
- [x] `POST /api/deals` (same URL and payload) stores and answers **202** in ~5 ms; a resend answers `deduped`.
      The crawler's timeout went from 180 s to 15 s.
- [x] Worker lanes: extract ×3, resolve+notify ×1 → **product matching is serialized** (3 simultaneous messages for a
      brand-new product → 1 product). Retries 30 s → 15 min, 6 attempts (≈30 min: rides out an AI outage);
      validation errors fail at once. Graceful stop on SIGINT/SIGTERM.
- [x] Photos that arrive before/while the deal is created are kept on the raw message and applied.
- [x] **Alerts gated per (alert, product)** (`alert_product_notifications`), after resolution.
      `alerts.last_notified_price` is no longer used (left in place for rollback; drop it later).
- [x] `bun run ingest:requeue-failed [since]`.
- Not done: queue stats on the admin dashboard (use the SQL in DEPLOY_NOTES for now); reprocessing deals that
  already exist (re-extraction would need an update path, not just a requeue).

Production steps: [`DEPLOY_NOTES.md`](./DEPLOY_NOTES.md#phase-7--durable-ingestion).

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
