import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '~/config';

// Pool sized like the old MariaDB pool (20): backfills and dashboard queries
// run alongside ingestion. Sessions use UTC so date math in SQL (date(ts),
// now() - interval …) matches the UTC timestamps stored.
const client = postgres(config.DATABASE_URL, {
  max: 20,
  connect_timeout: 30,
  connection: { TimeZone: 'UTC' },
});

const db = drizzle(client);

export default db;
