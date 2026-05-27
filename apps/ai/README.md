# ai-service

Centralized AI capabilities for the bargah.com.br platform. Built with **Hono** and **Bun**.

Exposes three HTTP capabilities so other services never call AI providers (OpenAI, Abacus) directly:

| Endpoint | Purpose |
|---|---|
| `POST /api/ai/extract` | Extract structured deal data (product, store, price, coupons, etc) from a raw Telegram message via LLM. |
| `POST /api/ai/embed` | Generate vector embeddings for one or more texts (used for product similarity search). |
| `POST /api/ai/judge` | Decide whether a new product is the same as any of N candidate products, for catalog deduplication. |

A single LLM provider (Abacus or OpenAI) backs `extract` and `judge`. Embeddings always use OpenAI (only provider with high-quality multilingual text embeddings).

## Setup

```sh
bun install
cp .env.example .env
# fill in ABACUS_API_KEY and/or OPENAI_API_KEY
bun run dev
```

## Environment

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development` \| `production` \| `test` |
| `PORT` | | `3003` | HTTP port |
| `LOG_LEVEL` | | `debug` (dev) / `info` (prod) | `debug` \| `info` \| `warn` \| `error` |
| `LLM_PROVIDER` | | `abacus` | `abacus` \| `openai` — backs `extract` and `judge` |
| `ABACUS_API_KEY` | if `LLM_PROVIDER=abacus` | — | RouteLLM API key |
| `ABACUS_MODEL` | | `claude-3-7-sonnet-20250219` | Model identifier on RouteLLM |
| `ABACUS_BASE_URL` | | RouteLLM URL | Chat completion endpoint |
| `ABACUS_TIMEOUT_MS` | | `30000` | Request timeout |
| `OPENAI_API_KEY` | always (for embed) | — | OpenAI API key |
| `OPENAI_LLM_MODEL` | | `gpt-4.1-nano` | Chat model when `LLM_PROVIDER=openai` |
| `OPENAI_LLM_BASE_URL` | | OpenAI URL | Chat completion endpoint |
| `OPENAI_LLM_TIMEOUT_MS` | | `30000` | Request timeout |
| `OPENAI_EMBEDDING_MODEL` | | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_BASE_URL` | | OpenAI URL | Embedding endpoint |
| `OPENAI_EMBEDDING_TIMEOUT_MS` | | `30000` | Request timeout |

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start with hot-reload |
| `bun run lint` | Run ESLint |
| `bun run test:bun` | Run unit tests |

## Architecture

```
src/
├── capabilities/            # one folder per HTTP capability
│   ├── extract/             # POST /api/ai/extract
│   ├── embed/               # POST /api/ai/embed
│   └── judge/               # POST /api/ai/judge
├── providers/
│   ├── llm/                 # Abacus + OpenAI chat completion (shared base class)
│   └── embedding/           # OpenAI embeddings
├── shared/                  # cross-capability primitives (retry, errors, types)
├── constants/               # http codes, categories
├── logger/                  # console logger with LOG_LEVEL support
├── middleware/              # request logger
├── types/                   # Hono context augmentation
├── config.ts                # Zod-validated env vars
└── index.ts                 # app factory + startup
```

### Capabilities are HTTP-shaped, providers are protocol-shaped

A *capability* is what callers ask for (e.g. "extract a deal", "judge if these products match"). It has its own prompt, schema, and orchestrator that knows how to use one or more providers.

A *provider* is how we talk to a specific LLM API (Abacus, OpenAI). Providers are interchangeable behind a thin `LLMProvider` / `EmbeddingProvider` interface.

This lets us:
- Swap providers via env var without touching capabilities.
- Add new capabilities (e.g. summarization) by adding a new folder under `capabilities/`, not by extending a god-class.
- Share retry policy, error vocabulary, and types in one place (`shared/`) — but **not** HTTP/fetch details, which are kept per-provider so each provider can evolve independently.

## Adding a new capability

1. Create `src/capabilities/<name>/`.
2. Add `<name>.ts` (Hono route), `schemas.ts` (Zod validation), and `services/<name>-orchestrator.ts`.
3. Inject the orchestrator via `c.set('xOrchestrator', ...)` in `index.ts` and declare it in `src/types/hono.d.ts`.
4. Mount the route under `/api/ai/<name>`.

## Adding a new LLM provider

1. Create `src/providers/llm/<name>.ts` implementing the `LLMProvider` interface (`chat(messages, options)`).
2. Register it in `src/providers/llm/factory.ts`.
3. Add config keys to `src/config.ts` and `.env.example`.

Existing providers (`abacus.ts`, `openai.ts`) are kept independent on purpose — they look similar today because Abacus follows OpenAI's wire format, but each may diverge without the other being touched.

## License

MIT
