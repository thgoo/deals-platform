// PM2 processes for bargah. Names, commands and ports match what ran before the
// monorepo, so dashboards, logs (~/.pm2/logs/<name>-*.log) and habits carry over.
//
//   pm2 start ecosystem.config.cjs                 # all apps
//   pm2 start ecosystem.config.cjs --only api.bargah.com.br
//
// Each app reads its own .env from apps/<name>/ (dotenv / Next.js), as before.

const os = require('os');
const path = require('path');

const BUN = process.env.BUN_PATH || path.join(os.homedir(), '.bun/bin/bun');

const app = (name, dir, args) => ({
  name,
  cwd: path.join(__dirname, 'apps', dir),
  script: BUN,
  args,
  interpreter: 'none',
  exec_mode: 'fork',
  autorestart: true,
  restart_delay: 3000, // a crash-looping app waits 3 s between restarts
});

module.exports = {
  apps: [
    app('api.bargah.com.br', 'api', 'run src/index.ts'),
    app('crawler.bargah.com.br', 'crawler', 'run src/index.ts'),
    app('bargah.com.br', 'web', 'run start -- -p 3004'),
  ],
};
