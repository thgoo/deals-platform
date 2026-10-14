import type { InferSelectModel } from 'drizzle-orm';
import { bigint, pgTable, text } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
  id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: text().notNull(),
  document: text().notNull().unique(),
  email: text().notNull().unique(),
  password: text().notNull(),
});

export type User = Omit<InferSelectModel<typeof usersTable>, 'password'>;
export type NewUser = typeof usersTable.$inferInsert;
