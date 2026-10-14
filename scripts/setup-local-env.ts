// Creates or updates local-development env files for every app from their
// .env.example, wired to the docker-compose database and to each other
// (shared secrets match).
//
//   bun scripts/setup-local-env.ts
//
// - Missing file: created from .env.example.
// - Existing file: values are never changed; keys that .env.example has and the
//   file lacks are appended (so re-running after a pull picks up new settings).
// - Keys a file lacks are filled from env files of retired apps (apps/messaging,
//   apps/ai) when they have them, so merged services keep their settings.
// Third-party credentials (OpenAI / Abacus, Telegram) are left for you to fill in.

import { randomBytes } from 'crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { hashPassword } from '../apps/web/lib/password';

const root = join(import.meta.dir, '..');

const ENV_FILES = {
  api: 'apps/api/.env',
  crawler: 'apps/crawler/.env',
  web: 'apps/web/.env.local',
} as const;

/** Env files of apps that were merged into api; read for values only. */
const RETIRED_ENV_FILES = ['apps/messaging/.env', 'apps/ai/.env'];

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

/**
 * .env.example lines with values filled in (comments kept): an explicit value
 * from `values` wins, then a non-empty value from a retired app's env file,
 * then the example's own default.
 */
function renderLines(app: App, values: Record<string, string>, fallback: Record<string, string>): string[] {
  const example = readFileSync(join(root, `apps/${app}/.env.example`), 'utf8');
  return example.split('\n').map(line => {
    const m = line.match(LINE);
    if (!m) return line;
    const key = m[2]!;
    const value = key in values ? values[key] : fallback[key] || undefined;
    if (value === undefined) return line;
    return `${m[1]}${key}${m[3]}${m[4]}${value}${m[4]}${m[6] ?? ''}`;
  });
}

const existing = Object.fromEntries(
  Object.entries(ENV_FILES).map(([app, file]) => [app, parse(join(root, file))]),
) as Record<App, Record<string, string>>;
const retired = Object.assign({}, ...RETIRED_ENV_FILES.map(f => parse(join(root, f)))) as Record<string, string>;
// Only settings that moved into api with the merged services (not PORT, NODE_ENV, …).
const retiredSettings = Object.fromEntries(
  Object.entries(retired).filter(([key]) => /^(LLM_|ABACUS_|OPENAI_|VAPID_)/.test(key)),
);

const hex = (bytes: number) => randomBytes(bytes).toString('hex');

const LOCAL_DATABASE_URL = 'postgres://deals:deals@127.0.0.1:5432/deals';

/** Generated only when web has no admin password yet; printed once at the end. */
let adminPassword: string | undefined;

// The one value this script does change: the api moved from MariaDB to Postgres
// (phase 5), so a local mysql:// URL is pointed at the compose Postgres.
const apiEnvPath = join(root, ENV_FILES.api);
if (existing.api.DATABASE_URL?.startsWith('mysql://')) {
  const content = readFileSync(apiEnvPath, 'utf8')
    .replace(/^(\s*DATABASE_URL\s*=\s*)"?mysql:\/\/[^"\s#]*"?/m, `$1"${LOCAL_DATABASE_URL}"`);
  writeFileSync(apiEnvPath, content);
  existing.api.DATABASE_URL = LOCAL_DATABASE_URL;
  console.log(`update  ${ENV_FILES.api} (DATABASE_URL: MariaDB → local Postgres)`);
}

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
    DATABASE_URL: LOCAL_DATABASE_URL,
    SESSION_SECRET: existing.api.SESSION_SECRET || hex(32),
    WEBHOOK_SECRET: webhookSecret,
    DASHBOARD_SECRET: dashboardSecret,
    VAPID_EMAIL: retired.VAPID_EMAIL || 'dev@localhost',
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
    ADMIN_SESSION_SECRET: existing.web.ADMIN_SESSION_SECRET || hex(32),
    ADMIN_PASSWORD_HASH: existing.web.ADMIN_PASSWORD_HASH || await hashPassword(adminPassword ??= hex(8)),
  },
};

for (const app of Object.keys(ENV_FILES) as App[]) {
  const file = ENV_FILES[app];
  const path = join(root, file);
  const lines = renderLines(app, values[app], app === 'api' ? retiredSettings : {});

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

const webVapid = parse(join(root, ENV_FILES.web)).NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const apiVapid = parse(join(root, ENV_FILES.api)).VAPID_PUBLIC_KEY;
if (webVapid && apiVapid && webVapid !== apiVapid) {
  console.warn(`
⚠ VAPID keys don't match: apps/web/.env.local has a different NEXT_PUBLIC_VAPID_PUBLIC_KEY
  than apps/api/.env (the private key for the old one is gone). Push alerts won't work until
  you set NEXT_PUBLIC_VAPID_PUBLIC_KEY in apps/web/.env.local to:
  ${apiVapid}`);
}

console.log(`
Still to fill in by hand (if empty):
  apps/api/.env       OPENAI_API_KEY (+ ABACUS_API_KEY if LLM_PROVIDER=abacus)
  apps/crawler/.env   only if you run the crawler locally — see README before doing that

Admin dashboard: http://localhost:3000/admin${adminPassword
    ? `  —  local admin password: ${adminPassword} (only shown now; re-hash with scripts/hash-admin-password.ts)`
    : ''}`);
