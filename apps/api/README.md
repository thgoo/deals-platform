# core-api

Main HTTP API for [bargah.com.br](https://bargah.com.br). Receives raw deals from the telegram-crawler, enriches them (URL expansion, affiliate rewriting, AI extraction), persists them, resolves each to a canonical product in the catalog, and serves the resulting feed to the web client.

Designed as a **set of focused modules behind one Hono app**: each feature (deals, products, alerts, auth, link-pipeline) lives in its own folder with services, schemas, and types co-located — the file you need is always under the feature you're working on.

## Key Technologies

*   **Hono**: Fast, lightweight web framework built on Web Standards
*   **Drizzle ORM** (`mysql2`): TypeScript-first ORM with explicit schema and zero magic
*   **MySQL**: Primary persistence
*   **Zod**: Schema validation for env vars, HTTP requests, and AI responses
*   **Bun**: Fast JavaScript runtime, package manager, and test runner

## What's Included

- **Deal intake pipeline** — link normalization + affiliate rewriting + AI extraction + product resolution, all triggered by `POST /api/deals`
- **Product catalog** with embedding-based deduplication (URL anchor → embedding similarity → LLM judge)
- **Alerts** — keyword-based push notifications delegated to messaging-service
- **Auth** — session-based authentication (cookie-driven)
- **SSE stream** of new deals for the web client
- **Drizzle migrations** generated from the schema files
- **Backfill script** to populate the product catalog from historical deals

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Configure Environment

Copy the template and fill in the required keys (see `.env.example` for the full list and inline docs):

```sh
cp .env.example .env
```

At minimum you need: `DATABASE_URL`, `SESSION_SECRET`, `WEBHOOK_SECRET`, `AI_SERVICE_URL`.

### 3. Apply Database Migrations

```sh
bun run db:migrate
```

### 4. Start Development Server

```sh
bun run dev
```

The server listens on `PORT` (default `8000`). On boot it loads the entire product catalog into an in-memory similarity cache — expect a short delay on the first start when the catalog grows.

## Available Scripts

| Command                     | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `bun run dev`               | Start development server with hot-reload                    |
| `bun run lint`              | Run ESLint                                                  |
| `bun run test:bun`          | Run unit tests                                              |
| `bun run db:generate`       | Generate a new migration from current schema state          |
| `bun run db:migrate`        | Apply pending migrations                                    |
| `bun run db:studio`         | Open Drizzle Studio (DB inspector) at localhost:4983        |
| `bun run backfill:products` | Resolve every existing deal into the product catalog        |

## Project Structure

```
src/
├── alerts/                       # keyword → push notification matching
│   └── services/alert-service.ts
├── auth/                         # session-based authentication
│   ├── services/                 # user / session / password
│   └── middleware/               # isAuthorized, isGuest
├── constants/                    # HTTP codes, session config
├── db/
│   ├── index.ts                  # Drizzle client
│   └── schemas/                  # one file per table — alerts, deals, products, ...
├── deals/
│   ├── deals.ts                  # HTTP routes (POST intake, list, SSE, ...)
│   ├── services/deal-service.ts  # DB queries
│   ├── text-cleaner.ts           # strips Telegram channel footers
│   └── schemas.ts                # Zod request validation
├── link-pipeline/                # URL extraction + affiliate rewriting + identifier extraction
│   ├── extractors/               # regex-based URL extraction & filtering
│   ├── resolvers/                # shortener expansion, network unwrap (HTTP)
│   ├── rewriters/                # affiliate tagging — providers per store
│   ├── identifiers/              # canonical-id extraction per store + host fallback
│   └── services/link-pipeline-service.ts   # orchestrator
├── products/                     # catalog & matching
│   ├── services/
│   │   ├── product-resolver-service.ts     # the orchestrator (4 paths)
│   │   ├── candidate-search-service.ts     # in-memory cosine similarity
│   │   ├── product-service.ts              # DB CRUD on productsTable
│   │   ├── url-mapping-service.ts          # source+external_id → product_id
│   │   └── decision-service.ts             # audit trail
│   └── matching-config.ts                  # shared thresholds (single source of truth)
├── logger/                       # console logger (LOG_LEVEL aware)
├── middleware/request-logger.ts  # colored access logs
├── types/hono.d.ts               # Context augmentation for c.get<T>()
├── utils/errors.ts               # HttpError class
├── ai-service-client.ts          # HTTP client for ai-service (embed / judge / extract)
├── app.ts                        # createApp factory (used by tests)
├── config.ts                     # Zod-validated env vars
└── index.ts                      # bootstrap (loads cache, starts Hono)
scripts/
└── backfill-product-catalog.ts   # one-off: resolve every existing deal
drizzle/                          # generated SQL migrations (commit these)
```

## Architecture

### Factory vs bootstrap separation

`app.ts` exports `createApp(...)` — a pure factory that builds a Hono app with injectable services. `index.ts` is the production entry point: it instantiates the heavy services (in particular it `await`s `candidateSearch.loadAll()` to pre-warm the in-memory product cache), then hands them to `createApp` and starts the server.

This split exists because tests import `createApp` from `app.ts` and would otherwise pay the cost of (and risk failing on) database I/O at module load time. Top-level `await` in `index.ts` is fine for the real server; not fine in test environments without a DB.

### Module pattern

Each feature folder follows the same shape:

```
<feature>/
├── <feature>.ts              # Hono routes
├── schemas.ts                # Zod request validation
├── services/                 # business logic + DB access
├── middleware/               # (optional) feature-scoped middleware
└── types.ts                  # (optional) shared types
```

Services are plain classes injected into the Hono context via `c.set('xxxService', instance)`. The context map is declared once in `src/types/hono.d.ts` so `c.get('dealService')` is type-safe everywhere.

### Deal intake pipeline — `POST /api/deals`

The crawler ships raw text + raw links + media. The intake handler runs four steps **synchronously** before returning, then fires two more **async**:

```
crawler → POST /api/deals
            │
            ├─ 1. dedupe check (chat + message_id)
            ├─ 2. cleanPromoText() — strip channel footers
            ├─ 3. heuristic: skip if no links AND no R$ mention
            ├─ 4. linkPipeline.process()    — expand, rewrite affiliate, extract IDs
            ├─ 5. aiService.extract()        — extract product / store / price / etc.
            ├─ 6. dealService.create()       — persist
            ├─ 7. emit SSE 'new-deal'
            ├─ 8. alertService.matchAndNotify()   ← fire-and-forget
            └─ 9. productResolver.resolve()       ← fire-and-forget
                  └ on completion: dealService.updateProductId()
            ⇣
        return { ok, id }
```

Sync steps must complete because the deal can't be persisted incomplete (no provisional rows). Async steps can fail without dragging the deal down — alerts and product resolution are best-effort enrichment.

### Product resolver — five paths

The resolver decides which product a deal belongs to (or creates a new one). It tries the cheapest option first:

| Method            | Trigger                                                       | Cost                  |
| ----------------- | ------------------------------------------------------------- | --------------------- |
| `url_anchor`      | Any external id (ASIN, MLB, ...) already maps to a product    | Single DB query       |
| `skipped`         | No product was extracted (cupom-only deal, etc.)              | Zero                  |
| `embedding_only`  | Top candidate's cosine similarity ≥ `AUTO_MATCH_THRESHOLD`    | One embed call        |
| `llm_judge`       | Top candidate's similarity ∈ [LLM_JUDGE, AUTO_MATCH)          | Embed + judge call    |
| `created_new`     | Best candidate below LLM_JUDGE, or LLM judge said no          | Embed + new product   |

Thresholds live in [`src/products/matching-config.ts`](src/products/matching-config.ts) and are shared between the live resolver and the backfill script — never duplicate them inline.

Every decision is written to `product_match_decisions` for audit and threshold calibration.

### Link pipeline — URL processing

`linkPipeline.process({ text, knownLinks })` performs four conceptually separable steps:

1. **Extraction** — regex URLs out of the message text, merge with the Telegram entity-layer links.
2. **Filtering** — drop t.me / channel-promo / "social" links that aren't actually products.
3. **Resolution** — follow shortener redirects, unwrap affiliate-network endpoints (Awin, etc.).
4. **Rewriting + identification** — apply affiliate tags via the store-specific rewriter and extract a canonical id via the matching identifier.

Each store has at most one rewriter and one identifier. The identifier registry ends with a **host fallback** that captures any non-shortener URL using the hostname as `source` and the pathname as `externalId` — so unknown stores still get URL anchor coverage without needing per-store code.

## How to Add a New Affiliate Rewriter

A rewriter knows how to turn a store URL into one that pays a commission. Stateless once constructed.

### 1. Create the provider in `src/link-pipeline/rewriters/providers/`

```typescript
// src/link-pipeline/rewriters/providers/newstore.ts
import type { AffiliateRewriter } from '../types';

export default class NewStoreRewriter implements AffiliateRewriter {
  readonly name = 'newstore';

  constructor(private readonly affiliateId: string | null) {}

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('newstore.com.br');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.affiliateId) return null;
    // ... rewrite logic ...
    return rewrittenUrl;
  }
}
```

### 2. Register it in the rewriter registry

```typescript
// src/link-pipeline/rewriters/registry.ts
registry.register(new NewStoreRewriter(cfg.newstore ?? null));
```

### 3. Add the config field

Add `newstore?: string` to `AffiliateConfig` in `src/link-pipeline/config.ts` and the matching `NEWSTORE_AFFILIATE_ID` env var to `config.ts` + `.env.example`.

## How to Add a New Canonical Identifier

An identifier extracts a store-specific product id (ASIN, MLB, ...) from a URL. Stateless.

### 1. Create the provider

```typescript
// src/link-pipeline/identifiers/providers/newstore.ts
import type { CanonicalIdentifier } from '../types';

const newStoreIdentifier: CanonicalIdentifier = {
  name: 'newstore',
  canHandle: url => url.toLowerCase().includes('newstore.com.br'),
  extract(url) {
    const match = new URL(url).pathname.match(/\/produto\/(\d+)/);
    return match?.[1] ?? null;
  },
};

export default newStoreIdentifier;
```

### 2. Register **before** the host fallback in `src/link-pipeline/identifiers/registry.ts`

Order matters: the registry returns the first identifier that claims a URL. The host fallback must stay last so specific identifiers always win.

## How to Add a New Entity (Table)

1. **Schema** — add `src/db/schemas/<entity>.ts` exporting an `xxxTable` plus `Xxx` / `NewXxx` types (`InferSelectModel` + `$inferInsert`). Use FKs with `.references(() => parentTable.id)` where applicable.
2. **Migration** — `bun run db:generate` reads the schema files and produces a new SQL file under `drizzle/`. Review it, commit it, then `bun run db:migrate`.
3. **Module** — `src/<entity>/` with `<entity>.ts` (routes), `services/<entity>-service.ts` (DB queries), `schemas.ts` (Zod request validation), `types.ts` (if shared types).
4. **Wire up** — instantiate the service in `app.ts`, declare it in `src/types/hono.d.ts`, mount the route via `app.route('/api/<entity>', ...)`.

## License

MIT
