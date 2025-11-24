import type { InferSelectModel } from 'drizzle-orm';
import { bigint, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

export const usersTable = mysqlTable('users', {
  id: bigint({ mode: 'number', unsigned: true })
    .autoincrement()
    .notNull()
    .unique()
    .primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  document: varchar({ length: 255 }).notNull().unique(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
});

// User type excludes password for safety - password should only be accessed
// during authentication (login/register), never exposed in API responses or context
export type User = Omit<InferSelectModel<typeof usersTable>, 'password'>;
export type NewUser = typeof usersTable.$inferInsert;
