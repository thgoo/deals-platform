// Posts a fake Telegram deal to the local api, the same way the crawler does.
// Lets you test ingestion end to end without running the crawler.
//
//   bun scripts/send-test-deal.ts
//   bun scripts/send-test-deal.ts "SSD Kingston NV2 1TB por R$ 399,90 https://www.amazon.com.br/dp/B0BBWH1R8H"
//
// Needs api + ai running (and ai needs real LLM/embedding keys), otherwise the
// api answers { skipped: 'extraction_failed' }.

import { readFileSync } from 'fs';
import { join } from 'path';

const apiEnv = readFileSync(join(import.meta.dir, '../apps/api/.env'), 'utf8');
const secret = apiEnv.match(/^WEBHOOK_SECRET\s*=\s*"?([^"\s#]+)/m)?.[1];
const port = apiEnv.match(/^PORT\s*=\s*"?(\d+)/m)?.[1] ?? '8000';
if (!secret) throw new Error('WEBHOOK_SECRET not found in apps/api/.env — run scripts/setup-local-env.ts');

const text = process.argv[2]
  ?? '🔥 Mouse Logitech G203 Lightsync RGB\n\n💰 R$ 99,90\n\n🛒 https://www.amazon.com.br/dp/B07YN82X3B';

const payload = {
  message_id: Date.now() % 2_147_483_647, // unique per run so dedupe doesn't skip it
  chat: 'local-test',
  chat_id: '0',
  ts: new Date().toISOString(),
  text,
  links: [],
};

const started = Date.now();
const res = await fetch(`http://localhost:${port}/api/deals`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': secret },
  body: JSON.stringify(payload),
});

console.log(`${res.status} in ${Date.now() - started}ms`, await res.json());
