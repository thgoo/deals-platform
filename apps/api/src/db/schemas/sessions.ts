import type { InferSelectModel } from 'drizzle-orm';
import { bigint, datetime, mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { usersTable } from './users';

export const sessionsTable = mysqlTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: bigint('user_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => usersTable.id),
  expiresAt: datetime('expires_at').notNull(),
});

export type Session = InferSelectModel<typeof sessionsTable>;
