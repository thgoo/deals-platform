// Creates local-development env files for every app from their .env.example,
// wired to the docker-compose database and to each other (shared secrets match).
//
//   bun scripts/setup-local-env.ts
//
// Never overwrites an existing file: delete it first to regenerate.
// Third-party credentials (OpenAI / Abacus, Telegram) are left for you to fill in.

import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');

const ENV_FILES = {
  api: 'apps/api/.env',
  ai: 'apps/ai/.env',
  messaging: 'apps/messaging/.env',
  crawler: 'apps/crawler/.env',
  web: 'apps/web/.env.local',
} as const;

type App = keyof typeof ENV_FILES;

function parse(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*?)\2\s*(#.*)?$/);
    if (m) out[m[1]!] = m[3]!;
  }
  return out;
}

/** Copies .env.example, replacing the value of each key in `values` (comments are kept). */
function render(app: App, values: Record<string, string>): string {
  const example = readFileSync(join(root, `apps/${app}/.env.example`), 'utf8');
  return example.split('\n').map(line => {
    const m = line.match(/^(\s*)([A-Z0-9_]+)(\s*=\s*)("?)(.*?)\4(\s*#.*)?$/);
    if (!m || !(m[2]! in values)) return line;
    return `${m[1]}${m[2]}${m[3]}${m[4]}${values[m[2]!]}${m[4]}${m[6] ?? ''}`;
  }).join('\n');
}

const existing = Object.fromEntries(
  Object.entries(ENV_FILES).map(([app, file]) => [app, parse(join(root, file))]),
) as Record<App, Record<string, string>>;

const hex = (bytes: number) => randomBytes(bytes).toString('hex');

// Reuse secrets from files that already exist, so regenerating one file keeps the others valid.
const webhookSecret = existing.api.WEBHOOK_SECRET || existing.crawler.BACKEND_SECRET || hex(16);
const dashboardSecret = existing.api.DASHBOARD_SECRET || existing.web.DASHBOARD_SECRET || hex(16);
let vapidPublic = existing.messaging.VAPID_PUBLIC_KEY || existing.web.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
let vapidPrivate = existing.messaging.VAPID_PRIVATE_KEY || '';

if (!vapidPublic || !vapidPrivate) {
  const proc = Bun.spawnSync(['./node_modules/.bin/web-push', 'generate-vapid-keys', '--json'], {
    cwd: join(root, 'apps/messaging'),
  });
  if (proc.exitCode !== 0) throw new Error(`web-push failed: ${proc.stderr.toString()}`);
  const keys = JSON.parse(proc.stdout.toString()) as { publicKey: string; privateKey: string };
  vapidPublic = keys.publicKey;
  vapidPrivate = keys.privateKey;
}

const values: Record<App, Record<string, string>> = {
  api: {
    NODE_ENV: 'development',
    DATABASE_URL: 'mysql://deals:deals@127.0.0.1:3306/deals',
    SESSION_SECRET: existing.api.SESSION_SECRET || hex(32),
    WEBHOOK_SECRET: webhookSecret,
    DASHBOARD_SECRET: dashboardSecret,
  },
  ai: {
    NODE_ENV: 'development',
  },
  messaging: {
    VAPID_PUBLIC_KEY: vapidPublic,
    VAPID_PRIVATE_KEY: vapidPrivate,
  },
  crawler: {
    NODE_ENV: 'development',
    BACKEND_BASE_URL: 'http://localhost:8000',
    BACKEND_SECRET: webhookSecret,
  },
  web: {
    NEXT_PUBLIC_BACKEND_URL: 'http://localhost:8000',
    INTERNAL_BACKEND_URL: 'http://localhost:8000',
    DASHBOARD_SECRET: dashboardSecret,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapidPublic,
  },
};

for (const app of Object.keys(ENV_FILES) as App[]) {
  const file = ENV_FILES[app];
  if (existsSync(join(root, file))) {
    console.log(`skip    ${file} (already exists)`);
    continue;
  }
  writeFileSync(join(root, file), render(app, values[app]));
  console.log(`create  ${file}`);
}

console.log(`
Still to fill in by hand:
  apps/ai/.env        OPENAI_API_KEY (+ ABACUS_API_KEY if LLM_PROVIDER=abacus)
  apps/crawler/.env   only if you run the crawler locally — see README before doing that

Admin dashboard: http://localhost:3000/${dashboardSecret}/admin`);
