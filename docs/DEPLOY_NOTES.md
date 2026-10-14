# Deploying the refactor to production, phase by phase

Each phase ends with a git tag (`phase-1`, `phase-2`, …). Deploy them **in order**, one at a time,
and let each run for a while before the next. Phase 1 has its own runbook: [`CUTOVER.md`](./CUTOVER.md).

General procedure for every phase after the cutover:

```sh
cd /var/www/bargah.com.br/bargah
git fetch --tags
git checkout phase-N          # detached HEAD on the tag is fine
# … the phase-specific steps below …
bun install --frozen-lockfile
scripts/deploy.sh <apps>      # note: deploy.sh runs `git pull`; on a tag use the manual restart below instead
```

Manual restart without pulling (when sitting on a tag):

```sh
(cd apps/web && bun run build)              # only if web changed
pm2 restart api.bargah.com.br crawler.bargah.com.br bargah.com.br --update-env
```

Rollback = `git checkout phase-(N-1)`, redo the phase N-1 steps that changed config, restart.

---

## Phase 2 — tooling and dependency upgrades

Apps restarted: api, crawler, web.

1. Upgrade bun to the version the repo pins:
   ```sh
   curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14"
   bun --version   # 1.3.14
   ```
2. Checkout `phase-2`, `bun install --frozen-lockfile`, build web, restart api, crawler, web.
3. Check: site loads, a new deal arrives (`pm2 logs api.bargah.com.br`), admin dashboard loads.

No config changes. Upgrades in this phase: hono 4.13, zod 4.6, next 16.4, react 19.3.

## Phase 3 — shared contracts

Apps restarted: api, crawler, web. No config changes.
The api's JSON was verified identical to phase 2, so this is a plain deploy.

## Phase 4 — messaging and ai folded into api

After this phase production runs **3 processes**: api, crawler, web.

1. **Before deploying**, add the merged services' settings to the api env. On the server:
   ```sh
   cd /var/www/bargah.com.br
   API_ENV=bargah/apps/api/.env
   # web push (from the messaging service)
   grep -E '^VAPID_' messaging/.env >> $API_ENV
   # AI providers (from the ai service)
   grep -E '^(LLM_PROVIDER|ABACUS_|OPENAI_)' ai/.env >> $API_ENV
   grep -E '^(VAPID_|LLM_PROVIDER|ABACUS_|OPENAI_)' $API_ENV | sed -E 's/=.{4}.*/=…/'   # check they're there
   ```
   `MESSAGING_SERVICE_URL` and `AI_SERVICE_URL` are no longer read; you can delete them.
2. Checkout `phase-4`, `bun install --frozen-lockfile`, restart **api** (crawler/web unchanged in behavior,
   restart them too to pick up the new lockfile).
3. Check in `pm2 logs api.bargah.com.br`: on the first deal, `LLM provider initialized`,
   `Extraction completed`, `Embedding provider initialized`, `Deal resolved to product`.
   Alerts: the next matching deal logs `Alert notification sent`.
4. Only then stop the old services and persist:
   ```sh
   pm2 delete ai.bargah.com.br messaging.bargah.com.br
   pm2 save
   ```

Rollback: checkout `phase-3`, restart api, and start ai/messaging again from their phase-3 commands
(`pm2 start ecosystem.config.cjs --only ai.bargah.com.br` on the phase-3 checkout).
