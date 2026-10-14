# Phase 1 cutover — old repos → monorepo (production)

Moves the 5 bargah PM2 processes from `/var/www/bargah.com.br/<app>` to the monorepo, **one process at a time**,
with the same PM2 names, commands and ports. Nothing else on the host is touched.

## Layout on the server

```
/var/www/bargah.com.br/
├── ai/ api/ crawler/ messaging/ web/   old checkouts — keep untouched until Phase 2 (rollback)
├── _media/                             LIVE photos (crawler/media and web/public/media point here)
├── media/                              old photos, last written Feb 2026 — not used by the apps
├── _sessions/                          LIVE Telegram session (mtcute SQLite db + WAL; crawler/sessions points here)
└── bargah/                             NEW: monorepo clone
    ├── media    -> ../_media           symlinks created by hand (gitignored)
    ├── sessions -> ../_sessions
    └── apps/<app>/.env*                copied from the old checkouts
```

No data moves: the monorepo's `media/` and `sessions/` are symlinks to the directories in use today.

**Use the targets the old checkouts actually use**, not the ones in git: on the server the symlinks were changed in place
(git says `../media` and `../sessions`, the server uses `../_media` and `../_sessions`). Check before linking:

```sh
ls -la /var/www/bargah.com.br/crawler/media /var/www/bargah.com.br/crawler/sessions /var/www/bargah.com.br/web/public/media
```

## ⚠️ Rules

- **Never copy the session, only symlink it.** It's a live SQLite database with a write-ahead log; a copy taken
  while the crawler runs can be corrupt or stale.
- **Never run two crawlers at once.** Two clients on the same Telegram session can get the session revoked
  (and you'd have to redo `bun run setup` with your phone). Always `pm2 delete` the old crawler *before* starting the new one.
- Switch one process, check its logs, then go to the next.
- Run `pm2 save` only at the end, once everything is green (so a reboot mid-way brings back the old setup).

## 1. Prepare (no impact on production)

```sh
cd /var/www/bargah.com.br
git clone git@github.com:thgoo/bargah.git bargah
cd bargah

ln -s ../_media media          # same target as crawler/media today
ln -s ../_sessions sessions    # same target as crawler/sessions today

for a in ai api crawler messaging web; do
  cp -a ../$a/.env* apps/$a/ 2>/dev/null || echo "no .env files in $a"
done
ls -la apps/*/.env*        # every app should have its env file(s)

bun install --frozen-lockfile
(cd apps/web && bun run build)   # api must be up (it is — the old one)
```

Sanity checks:

```sh
ls -t media | head -3                   # newest photos = today's (if they're from Feb, the link is wrong)
ls apps/web/public/media | head -3      # same files
ls sessions                             # telegram_crawler_session.mtcute.db (+ -wal/-shm while running)
```

## 2. Switch processes (order: lowest risk first)

For each app, in this order — `ai`, `messaging`, `api`, `crawler`, `web`:

```sh
pm2 delete ai.bargah.com.br
pm2 start ecosystem.config.cjs --only ai.bargah.com.br
pm2 logs ai.bargah.com.br --lines 50    # wait for a clean start, Ctrl+C
```

What "green" looks like per app:

| App | Check |
|---|---|
| `ai.bargah.com.br` | log `AI service initialized`; `curl -s localhost:3003/health` |
| `messaging.bargah.com.br` | log `Messaging service running`; `curl -s localhost:3002/health` |
| `api.bargah.com.br` | log `Candidate cache loaded`; site feed loads; next deal from Telegram shows `Deal created` + `Deal resolved to product` |
| `crawler.bargah.com.br` | connects to Telegram, next message logs `Message received` → `Deal sent to backend` |
| `bargah.com.br` | site loads on its domain, images load, admin dashboard loads |

(Check the ports against your `.env` files if they differ from the defaults.)

## 3. Finish

```sh
pm2 ls          # 5 bargah processes online, cwd under /var/www/bargah.com.br/bargah/apps
pm2 save        # persist the new setup for reboots
```

From now on, deploys are:

```sh
cd /var/www/bargah.com.br/bargah
scripts/deploy.sh               # everything
scripts/deploy.sh api web       # or just some apps
```

## Rollback (per process)

Delete the new process and start the old one exactly as it was:

```sh
pm2 delete api.bargah.com.br
cd /var/www/bargah.com.br/api && pm2 start ~/.bun/bin/bun --name api.bargah.com.br -- run src/index.ts
```

Same for `ai`, `messaging`, `crawler` (`-- run src/index.ts`) and web:

```sh
cd /var/www/bargah.com.br/web && pm2 start ~/.bun/bin/bun --name bargah.com.br -- run start -- -p 3004
```

If you ran `pm2 save` already, run it again after rolling back.

## After a week of stability

- Archive the old GitHub repos (`deals-backend`, `deals-crawler`, `deals-client-web`, `deals-ai-service`, `deals-messaging-service`).
- Remove the old checkouts from `/var/www/bargah.com.br/` (keep `_media/` and `_sessions/`!).
  The old `media/` (Feb 2026) can go too once you've confirmed nothing points to it — `coupon.png` already exists in `_media/`.
