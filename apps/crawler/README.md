# telegram-crawler

Telegram channel crawler for monitoring promo channels and sending webhooks to the web backend.

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Environment Variables

Create a `.env` file in the root:

```env
TG_API_ID=your_api_id
TG_API_HASH=your_api_hash
SESSION_DIR=/app/session
SESSION_NAME=promo_session
WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/telegram
WEBHOOK_SECRET=devsecret
MEDIA_DIR=/app/media
TARGET_CHATS=@channel1,@channel2,@channel3
```

### 3. Authenticate with Telegram

Run the setup script to authenticate:

```bash
bun run setup.ts
```

Follow the prompts to enter your phone number and verification code.

### 4. Run the Crawler

```bash
bun run index.ts
```

Or in development mode:

```bash
bun run dev
```

## Docker

Build and run in Docker:

```bash
docker build -t telegram-crawler .
docker run --env-file .env -v ./sessions:/app/session -v ./media:/app/media telegram-crawler
```

## Architecture

- **GramJS**: Telegram client library for Node.js
- **Webhooks**: Sends promo data to web backend
- **Image Download**: Automatically downloads and notifies backend when images are ready
- **Session Persistence**: Stores Telegram session to avoid re-authentication

## Features

- ✅ Monitor multiple Telegram channels
- ✅ Extract links from messages
- ✅ Download images automatically
- ✅ Send webhooks to backend
- ✅ Handle 2FA authentication
- ✅ Persistent sessions
- ✅ Affiliate link generation via external APIs

## External API Services

The project includes a modular structure for interacting with external APIs for affiliate link generation:

```
src/
├── services/
│   ├── api/
│   │   ├── interfaces.ts       # Common interfaces
│   │   ├── config.ts          # API configurations
│   │   ├── factory.ts         # Service factory
│   │   ├── integration.ts      # Integration helpers
│   │   ├── index.ts           # Exports
│   │   └── providers/         # API implementations
│   │       └── aliexpress.ts    # AliExpress API
```

### Using API Services

```typescript
// Example: Generate AliExpress affiliate link
import { ApiServiceFactory } from './services/api';

const aliexpressService = ApiServiceFactory.createService('aliexpress');
if (aliexpressService) {
  // Generate API URL
  const apiUrl = await aliexpressService.generateLink(productUrl);
  
  // Make request and get affiliate link
  const result = await aliexpressService.makeRequest(productUrl);
  console.log('Affiliate link:', result.affiliateLink);
}
```

### Environment Variables for API Services

Add these to your `.env` file:

```env
# AliExpress API Service
ALIEXPRESS_APP_KEY=your_app_key
ALIEXPRESS_APP_SECRET=your_app_secret
ALIEXPRESS_TRACKING_ID=your_tracking_id
```

