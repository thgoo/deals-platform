// Creates or updates local-development env files for every app from their
// .env.example, wired to the docker-compose database and to each other
// (shared secrets match).
//
//   bun scripts/setup-local-env.ts
//
// - Missing file: created from .env.example.
// - Existing file: values are never changed; keys that .env.example has and the
//   file lacks are appended (so re-running after a pull picks up new settings).
// - Values from env files of retired apps (apps/messaging) are carried over.
// Third-party credentials (OpenAI / Abacus, Telegram) are left for you to fill in.

import { randomBytes } from 'crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dir, '..');

const ENV_FILES = {
  api: 'apps/api/.env',
  ai: 'apps/ai/.env',
  crawler: 'apps/crawler/.env',
  web: 'apps/web/.env.local',
} as const;

/** Env files of apps that were merged into api; read for values only. */
const RETIRED_ENV_FILES = ['apps/messaging/.env'];

type App = keyof typeof ENV_FILES;

const LINE = /^(\s*)([A-Z0-9_]+)(\s*=\s*)("?)(.*?)\4(\s*#.*)?$/;

function parse(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(LINE);
    if (m) out[m[2]!] = m[5]!;
  }
  return out;
}

/** .env.example lines, with the value of each key in `values` replaced (comments kept). */
function renderLines(app: App, values: Record<string, string>): string[] {
  const example = readFileSync(join(root, `apps/${app}/.env.example`), 'utf8');
  return example.split('\n').map(line => {
    const m = line.match(LINE);
    if (!m || !(m[2]! in values)) return line;
    return `${m[1]}${m[2]}${m[3]}${m[4]}${values[m[2]!]}${m[4]}${m[6] ?? ''}`;
  });
}

const existing = Object.fromEntries(
  Object.entries(ENV_FILES).map(([app, file]) => [app, parse(join(root, file))]),
) as Record<App, Record<string, string>>;
const retired = Object.assign({}, ...RETIRED_ENV_FILES.map(f => parse(join(root, f)))) as Record<string, string>;

const hex = (bytes: number) => randomBytes(bytes).toString('hex');

// Reuse secrets from files that already exist, so regenerating one file keeps the others valid.
const webhookSecret = existing.api.WEBHOOK_SECRET || existing.crawler.BACKEND_SECRET || hex(16);
const dashboardSecret = existing.api.DASHBOARD_SECRET || existing.web.DASHBOARD_SECRET || hex(16);
let vapidPublic = existing.api.VAPID_PUBLIC_KEY || retired.VAPID_PUBLIC_KEY
  || existing.web.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
let vapidPrivate = existing.api.VAPID_PRIVATE_KEY || retired.VAPID_PRIVATE_KEY || '';

if (!vapidPublic || !vapidPrivate) {
  const proc = Bun.spawnSync(['./node_modules/.bin/web-push', 'generate-vapid-keys', '--json'], {
    cwd: join(root, 'apps/api'),
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
    VAPID_EMAIL: retired.VAPID_EMAIL || 'dev@localhost',
    VAPID_PUBLIC_KEY: vapidPublic,
    VAPID_PRIVATE_KEY: vapidPrivate,
  },
  ai: {
    NODE_ENV: 'development',
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
  const path = join(root, file);
  const lines = renderLines(app, values[app]);

  if (!existsSync(path)) {
    writeFileSync(path, lines.join('\n'));
    console.log(`create  ${file}`);
    continue;
  }

  const missing = lines.filter(line => {
    const key = line.match(LINE)?.[2];
    return key !== undefined && !(key in existing[app]);
  });
  if (missing.length === 0) {
    console.log(`ok      ${file}`);
    continue;
  }
  appendFileSync(path, `\n# Added by scripts/setup-local-env.ts\n${missing.join('\n')}\n`);
  console.log(`update  ${file} (+ ${missing.map(l => l.match(LINE)![2]).join(', ')})`);
}

console.log(`
Still to fill in by hand:
  apps/ai/.env        OPENAI_API_KEY (+ ABACUS_API_KEY if LLM_PROVIDER=abacus)
  apps/crawler/.env   only if you run the crawler locally — see README before doing that

Admin dashboard: http://localhost:3000/${dashboardSecret}/admin`);
