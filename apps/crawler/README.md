# telegram-crawler

Listens to promotional channels on Telegram and ships raw deals to core-api. Intentionally minimal: no link expansion, no affiliate rewriting, no AI extraction — every enrichment now lives on the backend. This service is a **pure forwarder**.

Designed to be **backend-agnostic** at the Telegram protocol layer: switching the Telegram client (mtcute → gramjs → other) means implementing one gateway interface — no caller changes.

## Key Technologies

*   **mtcute**: Default Telegram client (MTProto, runs natively in Bun)
*   **Bun**: Fast JavaScript runtime, package manager, and test runner

## What's Included

- Telegram client wrapper behind a `TelegramGateway` interface (default impl: `mtcute`)
- Channel-only message filter (silently drops DMs / groups)
- Async photo downloader with a bounded download queue
- Webhook client with retry that ships each deal to core-api (`POST /api/deals`) and media notifications (`POST /api/deals/image`)
- Graceful shutdown that drains the download queue before exiting
- Structured logging (development: colored console, production: JSON)
- One-shot interactive setup script to create the Telegram session

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Configure Environment

```sh
cp .env.example .env
```

Required: `TG_API_ID`, `TG_API_HASH` (from <https://my.telegram.org/apps>), `TARGET_CHATS`, `BACKEND_BASE_URL`, `BACKEND_SECRET`.

### 3. Generate the Telegram Session

mtcute needs a stored session to log in without prompting every start. Run the interactive setup once — it asks for your phone, the SMS code, and (if enabled) 2FA password, then writes the session into `SESSION_DIR`.

```sh
bun run setup
```

### 4. Start Development Server

```sh
bun run dev
```

The crawler connects to Telegram, subscribes to every channel in `TARGET_CHATS`, and forwards every message to core-api.

## Available Scripts

| Command               | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `bun run dev`         | Run the crawler with hot-reload                          |
| `bun run setup`       | Interactive Telegram session creator                     |
| `bun run test`        | Run unit tests                                           |
| `bun run type-check`  | Type-check without emitting JS                           |
| `bun run build`       | Compile to `dist/` (for `node` production deployments)   |
| `bun run start`       | Run from compiled output (`node dist/index.js`)          |

## Project Structure

```
src/
├── telegram/
│   ├── gateways/                      # one folder per Telegram client backend
│   │   ├── gateway.ts                 # TelegramGateway interface
│   │   ├── mtcute-gateway.ts          # default mtcute implementation
│   │   └── index.ts                   # getTelegramGateway(backend)
│   ├── auth/                          # auth providers (mtcute session loader)
│   ├── runtime.ts                     # singleton accessor for the active gateway
│   └── index.ts                       # re-exports
├── processing/
│   ├── message-handler.ts             # the single message → payload → POST routine
│   └── utils.ts                       # latency helper
├── media/
│   ├── queue.ts                       # bounded async download queue
│   └── downloader.ts                  # photo download via the gateway
├── webhook/
│   └── client.ts                      # core-api client (sendDeal + sendMediaNotification)
├── shared/
│   ├── errors.ts                      # ProcessingError + handleError
│   ├── retry.ts                       # withRetry + presets
│   └── types.ts                       # DealPayload, MediaInfo
├── logger/                            # console logger (LOG_LEVEL aware)
├── config.ts                          # env vars, no runtime validation
├── setup.ts                           # interactive session creator
└── index.ts                           # bootstrap: gateway, message handler, shutdown
```

## Architecture

### Pure forwarder principle

The crawler used to do affiliate rewriting, link expansion, and AI extraction inline before posting. All of that was moved to core-api in the refactor of late 2026, because:

- **Single source of truth** for affiliate config, store identifiers, and AI prompts (core-api owns them)
- **No duplicated business logic** — when a new store needs a rewriter, you add it in one place
- **The crawler can be killed and re-deployed safely** without losing in-progress enrichment work — it has none

Anything that's not strictly "fetch messages from Telegram and forward bytes" doesn't belong here. The current responsibilities are:

| What                                       | Why it stays here                                          |
| ------------------------------------------ | ---------------------------------------------------------- |
| Maintaining the Telegram session           | Only this service has the MTProto credentials              |
| Filtering channel-vs-DM-vs-group           | Transport-level filter — saves an HTTP round-trip to core  |
| Downloading photos via the protocol        | Only the gateway has the MTProto file fetcher              |
| Forwarding raw text + entity links + media | The service's reason for existing                          |

### Gateway pattern

The Telegram client lives behind an interface so we're not married to a specific library:

```typescript
interface TelegramGateway {
  initialize(opts: InitOptions): Promise<void>;
  onMessage(handler: (msg: TelegramIncomingMessage) => Promise<void>): void;
  resolveChatAlias(chatId: string): Promise<string>;
  downloadPhoto(photoId: string, dest: string): Promise<void>;
  disconnect(): Promise<void>;
}
```

The currently registered backend is `mtcute`, selected via the `TELEGRAM_BACKEND` env var. Adding a new one is a self-contained change in `src/telegram/gateways/`.

### Photo download is async; the notification is gated on the deal POST

A photo arriving from Telegram CDN can be downloaded faster than core-api can finish processing the parent deal. If we sent the media notification right after the download, it would arrive **before** the deal exists in the DB — and the `UPDATE deals SET local_path = ?` would silently match zero rows.

The fix: the photo download still happens in parallel with the deal POST, but the notification call is gated on the deal-send Promise resolving successfully.

```typescript
const dealSent = this.sendDealSafely(payload);   // Promise<boolean>

mediaDownloader.enqueuePhotoDownload(photoId, ..., async filePath => {
  const ok = await dealSent;                      // wait here until the deal lands
  if (!ok) return;                                // and skip if the POST failed
  await webhookClient.sendMediaNotification(photoId, filePath);
});

await dealSent;                                   // handler doesn't return until POST done
```

This is invisible to core-api — it just sees the notification arrive after the deal exists.

### Failure model

Two layers retry transparently:

| Layer                          | Retry policy                                  | On exhaustion                                              |
| ------------------------------ | --------------------------------------------- | ---------------------------------------------------------- |
| `webhook/client.ts` (HTTP)     | Exponential backoff, transient errors only    | Throws — caught by message-handler, logged, message dropped |
| `media/queue.ts` (download)    | Internal queue retry                          | Photo skipped, deal still goes through without local_path  |

The crawler **never blocks the Telegram event loop on retries** — if core-api is unhealthy, deals are lost but the crawler keeps reading messages so we don't fall behind.

## How to Add a New Telegram Backend

### 1. Implement `TelegramGateway` in `src/telegram/gateways/<backend>-gateway.ts`

```typescript
export class MyGateway implements TelegramGateway {
  async initialize(opts: InitOptions) { /* ... */ }
  onMessage(handler) { /* ... */ }
  async resolveChatAlias(chatId) { /* ... */ }
  async downloadPhoto(photoId, dest) { /* ... */ }
  async disconnect() { /* ... */ }
}
```

### 2. Register it in `src/telegram/gateways/index.ts`

```typescript
export function getTelegramGateway(backend: string): TelegramGateway {
  switch (backend) {
    case 'mtcute':   return new MtcuteGateway();
    case 'my-backend': return new MyGateway();
    default: throw new Error(`Unknown TELEGRAM_BACKEND: ${backend}`);
  }
}
```

### 3. Set the env var

```sh
TELEGRAM_BACKEND=my-backend
```

No other code needs to change — the rest of the crawler uses the gateway interface only.

## License

MIT
