import { drizzle } from 'drizzle-orm/mysql2';
import { config } from '~/config';

const db = drizzle(config.DATABASE_URL);

export default db;
