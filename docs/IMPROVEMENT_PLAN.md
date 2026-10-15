# Improvement plan — round 2

Written 2026-10-15, right after the production switch ([`REFACTOR_PLAN.md`](./REFACTOR_PLAN.md), all phases done).
This round is about **quality and learning**, not structure: remove what's dead, merge what's duplicated, fix the
logic bugs found in review, and use each step to learn something.

## Context for a fresh session

- Monorepo (Bun workspaces): `apps/api` (Hono + Drizzle + Postgres/pgvector, ingestion worker in-process),
  `apps/crawler` (Telegram → api), `apps/web` (Next.js 16), `packages/shared` (zod schemas + DTOs),
  `packages/config` (tsconfig, eslint).
- Production: one EC2 (Amazon Linux 2023), PM2 via `ecosystem.config.cjs`, Postgres in Docker
  (`deploy/postgres`), deploy with `scripts/deploy.sh`, migrations by hand (`cd apps/api && bun run db:migrate`).
  Nightly cron: `pg-backup.sh` (04:15 UTC) and `media:prune` (04:30 UTC, 30 days).
- Repo is **public**: never commit secrets, server IPs or key names.
- Conventions: Conventional Commits, one commit per logical step, `bun run check` (typecheck + lint + tests) green
  before each commit. Server/env steps: Claude gives one command at a time, the user runs it and pastes the output.

Every finding below was verified in the code on 2026-10-15 (file references are to that state).

---

## Round 1 — Dead code and hidden errors (quick wins)

### 1.1 Stale Hono context types — hidden by `skipLibCheck` ⚠️
`apps/api/src/types/hono.d.ts` imports `Session, User` from `~/db/schemas`, which no longer exists (auth was removed
in phase 9), and still declares `user`, `session`, `token` on the context. It compiles only because
`skipLibCheck: true` (packages/config/tsconfig.base.json) skips **all** `.d.ts` files — including our own.
- Remove the three entries and the import.
- Rename it `hono-context.ts` (a regular `.ts` with `export {}` + `declare module`), so it gets type-checked.
- **Learn:** what `skipLibCheck` really skips, and why your own declarations shouldn't live in `.d.ts` files.

### 1.2 Routes nobody calls
Only the crawler and web call the api; none of them use these (checked with grep):
- `POST /api/deals/image`: the "older crawlers" path; the old crawler is gone. Also remove `updateImageSchema` and
  `ImagePayload` (`packages/shared/src/ingest.ts`) and the stale endpoint comments in `ingest.ts` and
  `apps/crawler/.env.example`.
- `PATCH /api/deals/:id/links` and `PATCH /api/deals/:id/extracted`: leftovers from the extractor service. Remove them
  with `updateLinksSchema`, `updateExtractedSchema`, `DealService.updateLinks/updateExtracted`.
- Unused `DealService` methods: `findAll`, `findByChat`, `count`, `findAllPaginated`, `findByChatPaginated`.

### 1.3 Unused code in general — add `knip` to CI
`bunx knip` found (among false positives such as root scripts):
- unused file `apps/web/app/utils/filters/index.ts`;
- unused exports: `formatTime`, `getFilename` (web `utils.ts`), `hashPassword` (web `lib/password.ts`, only the
  script needs it), `tokenize`, `getActiveEmbeddingProviderName`, `AIServiceError`, `AppError`, …;
- `HTTP_STATUS_CODE` (`apps/api/src/constants/http.ts`): a 60-member enum, of which 3 members are used. Use plain
  numbers (`c.json(body, 404)`) as Hono intends, and delete the file;
- **unlisted dependencies**: `server-only` (imported by web admin `_lib`) and `postcss` aren't in
  `apps/web/package.json` (they resolve by luck through hoisting);
- unused dev dependencies in web: `@stylistic/eslint-plugin`, `baseline-browser-mapping`.

Steps: add `knip.json` (entry points: the `scripts/`, `ecosystem.config.cjs`, Next app dir), fix the findings, add
`bunx knip` to `.github/workflows/ci.yml`.
**Learn:** how knip builds the import graph from entry points; why "unlisted dependencies" break under isolated
installs.

### 1.4 Drop `alerts.last_notified_price`
Replaced by `alert_product_notifications.last_notified_price` (per product); the `alerts` column is no longer read.
It was kept only for rollback, which no longer exists. Drizzle migration + remove it from `db/schemas/alerts.ts`.

---

## Round 2 — Duplicates

### 2.1 One logger for api and crawler
`apps/api/src/logger/*` and `apps/crawler/src/logger/*` are **identical** (4 files, 118 lines each). Move them to
`packages/shared` (or a new `packages/logger`) and import them from both apps.

### 2.2 One retry helper
`apps/api/src/ai/retry.ts` (81 lines) and `apps/crawler/src/shared/retry.ts` (87 lines): same idea (exponential
backoff, max delay), different defaults and "retryable?" rules. Make one generic `withRetry(fn, { attempts, …,
isRetryable })` in shared; each app passes its own `isRetryable`. Keep both test files' cases.

### 2.3 One coupon definition
A coupon is defined 4 times: `Coupon` in `packages/shared/src/deals.ts`, `Coupon` in `db/schemas/deals.ts`,
`couponSchema` in `deals/schemas.ts` and `couponSchema` in `ai/extract/schemas.ts` (the AI one turns
`discount: null` into `undefined`). Keep **one zod schema** in shared, infer the type (`z.infer`), and let the AI
schema extend it with its null-handling.
**Learn:** "schema as the source of truth": zod → types, instead of types and schemas drifting apart.

### 2.4 Small web duplicates
- `formatPrice` (`app/utils.ts`) and `formatBRL` (`admin/_components/format.ts`) do the same thing; keep one.
  (The two `formatRelativeTime` functions are different on purpose: pt-BR site vs English admin.)
- `app/utils.ts` and the `app/utils/` folder coexist, and so do `lib/` and `app/lib/`. Pick one place for each.

---

## Round 3 — Logic bugs

### 3.1 Feed pagination skips deals ⚠️ (real bug)
`GET /api/deals` pages with `WHERE ts < cursor ORDER BY ts DESC` (`deal-service.ts` `findWithFilters`). Telegram
timestamps have **second** precision and 6 channels post at once: if two deals share the boundary second, the one
not on the current page is **skipped forever**.
- Fix with keyset pagination on `(ts, id)`: `ORDER BY ts DESC, id DESC`,
  `WHERE (ts, id) < ($cursorTs, $cursorId)`; the cursor becomes `"<iso>_<id>"` (or base64). Index `(ts DESC, id DESC)`.
- Write the test first (fake data with equal `ts`), see it fail, then fix.
- **Learn:** keyset vs offset pagination, row-value comparisons in Postgres.

### 3.2 `hasCoupon` filter is probably wrong
`hasCoupon=true` means `coupons IS NOT NULL`, but the pipeline stores `extraction.coupons` as is, including `[]`. So
"no coupons" deals probably match. Check in prod first:
`SELECT count(*) FILTER (WHERE coupons = '[]'), count(*) FILTER (WHERE jsonb_array_length(coupons) > 0) FROM deals;`
Then either store `NULL` for no coupons (pipeline + one data migration) or filter with `jsonb_array_length`. The web
doesn't use this filter today; also check the dashboard's coupon stats and the migration check that counted
"deals with coupons: 73707".

### 3.3 Search: wildcards and speed
- The search string goes straight into `LIKE '%…%'`: a user typing `%` or `_` gets wildcard behavior. Escape them.
- Every search is a sequential scan over all deals (LIKE on a nondeterministic collation can't use a btree index).
  Fine at 105k rows, but measure it: `EXPLAIN (ANALYZE, BUFFERS)` on a real search.
- If it's slow (or as a learning exercise): Postgres full-text search — a generated `tsvector` column with
  `unaccent` + the `portuguese` config, a GIN index, `websearch_to_tsquery`. Compare results and timing with LIKE.
- **Learn:** reading `EXPLAIN ANALYZE`, GIN indexes, FTS vs trigram (`pg_trgm`) trade-offs.

---

## Round 4 — Tests where the risk is (learning: integration tests)

Today: 23 test files, all unit tests with fakes. The SQL — the queue claim (`FOR UPDATE SKIP LOCKED`), the
pagination, the dashboard stats, the resolver's queries — has **no tests**.
- Add a Postgres service container to CI (`pgvector/pgvector:pg18`), run migrations, and add a `*.db.test.ts` suite
  that runs against it (locally: the docker-compose Postgres, a separate `deals_test` database).
- First tests: queue claim with two concurrent workers (no row claimed twice; lease expiry re-claims), pagination
  with equal timestamps (3.1), `hasCoupon` (3.2), `media:prune` deal clearing.
- **Learn:** test isolation per test (transaction rollback vs truncate), GitHub Actions service containers.

---

## Round 5 — Big web components (learning: React structure)

- `admin/_components/review-modal.tsx` — 656 lines, 16 `useState`. Split into: a `useReviewState` hook (a
  `useReducer` instead of 16 separate states), `DealLine`, and pure helpers (`medianOf`, `parseBrlToCents`,
  `describeDeviation`) moved to a tested module.
- `admin/page.tsx` — 409 lines: extract its sections.
- **Learn:** when `useReducer` beats `useState`; testing pure helpers instead of components.

---

## Round 6 — Operations

- **Off-host backups.** Today the dumps are on the same disk as the database. Simplest: EBS snapshots with AWS Data
  Lifecycle Manager (console only). Alternative: `aws s3 cp` of the latest dump at the end of `pg-backup.sh`.
- **PM2 logs grow forever.** Check `pm2 ls` for `pm2-logrotate`; if missing, `pm2 install pm2-logrotate`
  (+ `max_size 20M`, `retain 7`).
- **Health endpoint + uptime alert.** `GET /health` (DB ping + worker alive + oldest pending raw message age) and a
  free external monitor (e.g. UptimeRobot) on it, so a dead crawler/worker gets noticed.
- **Queue stats on the dashboard.** Counts per step/outcome, failures in the last 24h, a "requeue failed" button
  (wraps `ingest:requeue-failed`).
- Copy `~/bargah_db-final-2026-10-15.sql.gz` off the server, then delete it.

---

## Round 7 — Optional

- Rename packages `@bargah/*` → `@deals/*` (bargah is the deployment; the code is the platform).
- AI evaluation set: ~50 real messages with the expected extraction, run against prompt/model changes before
  shipping them (`bun run ai:eval`). **Learn:** evaluating LLM features like tests.
- Store name normalization ("Mercado Livre" / "mercadolivre" / "MELI") at ingestion.

---

## Suggested order

Rounds 1 → 3 first (small, safe, and 3.1 is a user-visible bug), then 4 (it would have caught 3.1 and 3.2), then
5–7 as time and curiosity allow. Each numbered item is one or two commits.
