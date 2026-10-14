import type { InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const sessionsTable = pgTable('sessions', {
  id: text().primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => usersTable.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type Session = InferSelectModel<typeof sessionsTable>;
