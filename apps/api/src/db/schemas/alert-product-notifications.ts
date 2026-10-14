import { integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { alertsTable } from './alerts';
import { productsTable } from './products';

/**
 * Last price an alert was notified at, per product. An alert fires again for a
 * product only at a lower price — but a cheap match on one product ("iphone"
 * case at R$ 49) no longer silences the alert for every other product (the
 * phone at R$ 5000), which the old per-alert last price did.
 */
export const alertProductNotificationsTable = pgTable('alert_product_notifications', {
  alertId: uuid('alert_id').notNull().references(() => alertsTable.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => productsTable.id, { onDelete: 'cascade' }),
  lastNotifiedPrice: integer('last_notified_price').notNull(),
  notifiedAt: timestamp('notified_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.alertId, table.productId] }),
]);
