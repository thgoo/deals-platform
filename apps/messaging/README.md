# messaging-service

A lightweight notification gateway built with **Hono** and **Bun**. Receives a message and a recipient, routes it through the correct delivery channel, and returns a typed result. Currently used in [bargah.com.br](https://bargah.com.br) for Web Push alerts.

Designed to be channel-agnostic: adding Email, Telegram, or WhatsApp means implementing one interface and registering it — no changes to the callers.

## Key Technologies

*   **Hono**: Fast, lightweight web framework built on Web Standards
*   **web-push**: Web Push protocol implementation with VAPID authentication
*   **Zod**: TypeScript-first schema validation
*   **Bun**: Fast JavaScript runtime and package manager

## What's Included

- Channel dispatcher (Strategy pattern — routes by `recipient.type`)
- Web Push channel (VAPID, FCM / APNs / Mozilla Autopush)
- Structured logging (development: colored console, production: JSON)
- Input validation with Zod
- Test page (development only — subscribe a browser and fire a push in one click)
- Health check endpoint

## Setup

### 1. Install Dependencies

```sh
bun install
```

### 2. Configure Environment

Create a `.env` file based on `.env.example`:

```env
PORT=3002
VAPID_EMAIL=you@email.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

### 3. Generate VAPID Keys

VAPID keys are generated once and stored in `.env`. The public key must also be set as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the frontend so the browser can create subscriptions tied to this server.

```sh
bunx web-push generate-vapid-keys
```

**Environment Variables:**
- `PORT`: HTTP port (default: `3002`)
- `VAPID_EMAIL`: Contact email sent to push services (e.g. `mailto:you@email.com`)
- `VAPID_PUBLIC_KEY`: VAPID public key — share with the frontend
- `VAPID_PRIVATE_KEY`: VAPID private key — keep secret, never commit

### 4. Start Development Server

```sh
bun run dev
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with hot-reload |

## Project Structure

```
src/
├── channels/
│   └── web-push.ts       # WebPushChannel — implements NotificationChannel
├── dispatcher.ts          # Routes recipient.type to the right channel
├── types.ts               # NotificationChannel interface, Recipient, Message, SendResult
├── schemas.ts             # Zod validation for POST /notify
├── config.ts              # Environment validation
└── index.ts               # Hono app, route registration
```

## Architecture

All channels implement the same interface:

```typescript
interface NotificationChannel {
  readonly type: ChannelType;
  send(recipient: Recipient, message: Message): Promise<SendResult>;
}
```

The `NotificationDispatcher` holds a registry of channels and delegates based on `recipient.type`:

```typescript
const dispatcher = new NotificationDispatcher()
  .register(new WebPushChannel(config.vapid));
```

`SendResult` is a discriminated union — callers handle each case explicitly:

```typescript
type SendResult =
  | { ok: true }
  | { ok: false; reason: 'recipient_gone' | 'channel_error'; error?: string };
```

When `recipient_gone` is returned (HTTP 410 from the push service), the caller should remove the subscription from its database — the browser unsubscribed or cleared its data.

## API

### `POST /notify`

Sends a notification to a recipient.

**Request:**
```json
{
  "recipient": {
    "type": "web-push",
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    }
  },
  "message": {
    "title": "🔔 Deal alert",
    "body": "iPhone 15 — R$ 4.799",
    "url": "/?search=iphone",
    "tag": "alert-iphone",
    "renotify": true,
    "actions": [
      { "action": "view",    "title": "View deal" },
      { "action": "dismiss", "title": "Dismiss"   }
    ]
  }
}
```

**Response:**

| Status | Body | Meaning |
|--------|------|---------|
| `200` | `{ "ok": true }` | Delivered |
| `200` | `{ "ok": false, "reason": "recipient_gone" }` | Subscription expired — delete it |
| `200` | `{ "ok": false, "reason": "channel_error", "error": "..." }` | Delivery failed — retry later |
| `400` | Zod validation error | Invalid request body |

### `GET /health`

Returns `{ "ok": true }`. Used for uptime monitoring.

### `GET /test` *(development only)*

Browser page for testing push subscriptions without a full frontend. Subscribes the browser, displays the subscription JSON, and generates the ready-to-run `curl` command.

## How to Add a New Channel

### 1. Add the channel type to `src/types.ts`

```typescript
// Before
export type ChannelType = 'web-push';
export type Recipient = {
  type: 'web-push';
  subscription: WebPushSubscription;
};

// After
export type ChannelType = 'web-push' | 'email';
export type Recipient =
  | { type: 'web-push'; subscription: WebPushSubscription }
  | { type: 'email'; address: string };
```

### 2. Create the channel in `src/channels/`

```typescript
// src/channels/email.ts
import type { NotificationChannel, Recipient, Message, SendResult } from '../types';

export class EmailChannel implements NotificationChannel {
  readonly type = 'email' as const;

  async send(recipient: Recipient, message: Message): Promise<SendResult> {
    if (recipient.type !== 'email') {
      return { ok: false, reason: 'channel_error', error: 'Wrong recipient type' };
    }
    // send email to recipient.address
    return { ok: true };
  }
}
```

### 3. Register it in `src/index.ts`

```typescript
import { EmailChannel } from './channels/email';

const dispatcher = new NotificationDispatcher()
  .register(new WebPushChannel(config.vapid))
  .register(new EmailChannel());        // new
```

### 4. Update the Zod schema in `src/index.ts`

```typescript
recipient: z.discriminatedUnion('type', [
  z.object({
    type: z.literal('web-push'),
    subscription: z.object({ ... }),
  }),
  z.object({
    type: z.literal('email'),
    address: z.string().email(),          // new
  }),
]),
```

## License

MIT
