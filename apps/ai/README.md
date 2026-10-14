# ai-service

Centralized AI capabilities for [bargah.com.br](https://bargah.com.br). Exposes three HTTP endpoints so the rest of the platform (core-api, scripts) never talks to OpenAI / Abacus / future providers directly — credentials, prompts, retry policy, and provider abstractions all live here.

Designed to be **provider-agnostic**: swapping a chat or embedding provider means implementing one interface and registering it — no caller changes.

## Key Technologies

*   **Hono**: Fast, lightweight web framework built on Web Standards
*   **Abacus AI (RouteLLM)**: Default LLM provider — OpenAI-compatible chat completions
*   **OpenAI**: Default embedding provider (and optional alternative LLM)
*   **Zod**: Schema validation for env vars and HTTP request/response
*   **Bun**: Fast JavaScript runtime, package manager, and test runner

## What's Included

- Three capabilities, each in its own folder under `src/capabilities/`:
  - **extract** — `POST /api/ai/extract`: raw deal text → structured fields (product, store, price, coupons, category, productKey)
  - **embed** — `POST /api/ai/embed`: list of texts → list of 1536-dim vectors via `text-embedding-3-small`
  - **judge** — `POST /api/ai/judge`: a new product + N candidates → decision (match or null)
- Provider abstractions: independent `AbacusProvider` / `OpenAIProvider` for chat, `OpenAIEmbeddingProvider` for vectors
- Exponential-backoff retry with configurable presets, shared across providers
- Prompt cache hinting (OpenAI `prompt_cache_key`) so repeated system prompts don't pay full token cost
- Structured logging (development: colored console, production: JSON)
- Health check endpoint reporting active providers and models
- Unit tests for retry, schemas, and the orchestrators

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Configure Environment

```sh
cp .env.example .env
```

Required keys depend on which providers you use (see inline docs in `.env.example`). The minimum to boot:

- `OPENAI_API_KEY` — always required, embeddings only work via OpenAI
- `ABACUS_API_KEY` — required if `LLM_PROVIDER=abacus` (default)

### 3. Start Development Server

```sh
bun run dev
```

The server listens on `PORT` (default `3003`). `GET /health` reports the active LLM and embedding providers.

## Available Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `bun run dev`      | Start development server with hot-reload |
| `bun run lint`     | Run ESLint                               |
| `bun run test:bun` | Run unit tests                           |

## Project Structure

```
src/
├── capabilities/                # one folder per HTTP capability
│   ├── extract/
│   │   ├── extract.ts            # POST /api/ai/extract
│   │   ├── schemas.ts            # Zod request/response
│   │   ├── prompts/              # extraction system prompt
│   │   └── services/             # ExtractOrchestrator
│   ├── embed/
│   │   ├── embed.ts              # POST /api/ai/embed
│   │   ├── schemas.ts
│   │   └── services/             # EmbedOrchestrator
│   └── judge/
│       ├── judge.ts              # POST /api/ai/judge
│       ├── schemas.ts
│       ├── prompts/              # judge system prompt (matching rules)
│       └── services/             # JudgeOrchestrator
├── providers/
│   ├── llm/                      # chat-completion providers (Abacus, OpenAI)
│   │   ├── abacus.ts             # standalone implementation
│   │   ├── openai.ts             # standalone implementation (with prompt_cache_key)
│   │   ├── factory.ts            # createLLMProvider(name) → LLMProvider
│   │   └── types.ts              # LLMProvider interface + ChatOptions
│   └── embedding/                # embedding providers
│       ├── openai.ts             # text-embedding-3-small
│       ├── factory.ts
│       └── types.ts              # EmbeddingProvider interface
├── shared/                       # cross-capability primitives
│   ├── retry.ts                  # withRetry + presets (AGGRESSIVE / STANDARD / FAST)
│   ├── errors.ts                 # AIServiceError / AIAPIError / AIParsingError
│   └── types.ts                  # ChatCompletionRequest/Response, EmbeddingRequest/Response
├── constants/                    # http codes, deal categories
├── logger/                       # console logger (LOG_LEVEL aware)
├── middleware/request-logger.ts
├── types/hono.d.ts
├── config.ts                     # Zod-validated env vars
└── index.ts                      # app factory + startup wiring
```

## Architecture

### Capabilities are HTTP-shaped, providers are protocol-shaped

A **capability** is what callers ask for ("extract a deal", "embed these texts", "is this the same product?"). Each capability has its own folder with prompt, schema, and an orchestrator that knows how to use one or more providers.

A **provider** is how we talk to one upstream API (OpenAI chat completions, OpenAI embeddings, Abacus chat). Providers are interchangeable behind a thin interface:

```typescript
interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(texts: string[]): Promise<EmbeddingResult>;
}
```

Capabilities depend on the interface, not the implementation. Swapping a provider means changing one line in `index.ts` (or one env var, since the factory already does the routing).

### Why standalone providers instead of a shared base class

`abacus.ts` and `openai.ts` look ~95% alike today because Abacus exposes an OpenAI-compatible API. A shared base class would shrink the line count but **couples** the two: a future Abacus quirk (custom headers, error envelope, billing fields) would either force the base class to grow or push the divergence into ugly subclass overrides.

Keeping them independent is **~50 lines of acceptable duplication** for stronger independence. The truly shared concepts (retry policy, error vocabulary, request/response types) already live in `shared/`.

### Retry happens inside the provider

Every provider's `chat()` / `embed()` wraps the actual HTTP call in `withRetry()` so transient failures (5xx, 408, 429, network errors) retry transparently with exponential backoff. Capabilities never see them. 4xx errors and parsing failures throw immediately — they won't be fixed by retrying.

### Prompt caching

For OpenAI, the provider reads `options.cacheKey` and forwards it as `prompt_cache_key`. With a fixed system prompt and a per-capability cache key (e.g. `'bargah-extraction'`), the static prefix gets a 50% token discount on repeat calls. Abacus ignores the field silently — no special casing needed.

## API

### `POST /api/ai/extract`

Extracts structured deal data from a raw Telegram message.

**Request**:
```json
{
  "text": "🎮 PlayStation 5 Slim Digital 1TB\nPor R$ 2.849\nhttps://amazon.com.br/dp/B0CL5KNB9M",
  "chat": "promo_channel",
  "messageId": 12345,
  "links": ["https://www.amazon.com.br/dp/B0CL5KNB9M"]
}
```

**Response**:
```json
{
  "text": "...",
  "description": "Pra zerar o backlog. Edição digital com 1TB.",
  "product": "PlayStation 5 Slim Digital 1TB",
  "store": "Amazon",
  "price": 284900,
  "coupons": [],
  "productKey": "sony-playstation-5-slim-digital-1tb",
  "category": "games"
}
```

### `POST /api/ai/embed`

Generates vector embeddings for the given texts (batch up to 100).

**Request**:
```json
{ "texts": ["PlayStation 5 Slim", "iPhone 15 Pro Max"] }
```

**Response**:
```json
{
  "embeddings": [[0.023, -0.187, ...], [0.412, 0.034, ...]],
  "model": "text-embedding-3-small",
  "dimensions": 1536,
  "usage": { "promptTokens": 12, "totalTokens": 12 }
}
```

### `POST /api/ai/judge`

Given a new product and similarity-ranked candidates, returns the matching candidate id or `null`.

**Request**:
```json
{
  "newProduct": "Galax RTX 4080 Super NITRO OC 16GB",
  "candidates": [
    { "id": "abc-123", "name": "Nvidia RTX 4080 Super 16GB", "score": 0.96 },
    { "id": "def-456", "name": "ASUS RTX 4090 24GB", "score": 0.81 }
  ]
}
```

**Response**:
```json
{ "matchedId": "abc-123" }
```

### `GET /health`

Returns service version and active providers per capability.

## How to Add a New Capability

### 1. Create `src/capabilities/<name>/`

```
<name>/
├── <name>.ts                # Hono route — POST /api/ai/<name>
├── schemas.ts               # Zod request/response
├── prompts/                 # (optional) system prompt(s)
└── services/<name>-orchestrator.ts
```

### 2. Implement the orchestrator

```typescript
export default class FooOrchestrator {
  constructor(
    private readonly llm: LLMProvider,
    private readonly logger: Logger,
  ) {}

  async run(input: FooRequest): Promise<FooResponse> {
    const messages = buildMessages(input);
    const raw = await this.llm.chat(messages, {
      responseFormat: 'json_object',
      temperature: 0,
      cacheKey: 'bargah-foo',
    });
    return parseResponse(raw);
  }
}
```

### 3. Wire it up

- Add the orchestrator type to `src/types/hono.d.ts`
- Instantiate it in `src/index.ts` and `c.set('fooOrchestrator', instance)`
- Mount the route: `app.route('/api/ai/foo', foo)`

## How to Add a New LLM Provider

### 1. Implement `LLMProvider` in `src/providers/llm/<name>.ts`

```typescript
export default class MyProvider implements LLMProvider {
  readonly name = 'myprovider';
  readonly model: string;
  // ... config, constructor, chat(messages, options) ...
}
```

### 2. Register it in `src/providers/llm/factory.ts`

```typescript
case 'myprovider': {
  if (!config.MYPROVIDER_API_KEY) throw new Error('Missing MYPROVIDER_API_KEY');
  return new MyProvider({ /* config */ });
}
```

### 3. Add env vars

Add `MYPROVIDER_API_KEY` (and any model / URL / timeout vars) to `src/config.ts` and `.env.example`.

## License

MIT
