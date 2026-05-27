import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import { config } from '~/config';

// Explicit pool config — the drizzle default (mysql2's `connectionLimit: 10`,
// `connectTimeout: 10s`) was too tight during backfill: heavy SQL on the
// same MySQL instance starved short queries (e.g. dashboard) until they hit
// `connect ETIMEDOUT`. Bumping the limit gives parallel callers headroom,
// and 30s connect tolerates a temporarily overloaded server without burning
// the request.
const pool = createPool({
  uri: config.DATABASE_URL,
  connectionLimit: 20,
  connectTimeout: 30_000,
  waitForConnections: true,
});

const db = drizzle(pool);

export default db;
