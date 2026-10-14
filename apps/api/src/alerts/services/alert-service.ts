import { randomUUID } from 'crypto';
import { and, eq, gt, inArray } from 'drizzle-orm';
import type { Alert, NewAlert, PushSubscription } from '~/db/schemas/alerts';
import type { Deal } from '~/db/schemas/deals';
import type { Logger } from '~/logger';
import { config } from '~/config';
import db from '~/db';
import { alertProductNotificationsTable } from '~/db/schemas/alert-product-notifications';
import { alertsTable } from '~/db/schemas/alerts';
import { WebPushSender } from '~/notifications/web-push';
import { isUuid } from '~/utils/ids';

const ALERT_EXPIRY_DAYS = 90;

export class AlertService {
  constructor(
    private readonly push = new WebPushSender({
      email: config.VAPID_EMAIL,
      publicKey: config.VAPID_PUBLIC_KEY,
      privateKey: config.VAPID_PRIVATE_KEY,
    }),
  ) {}

  async create(data: {
    keyword: string;
    subscription: PushSubscription;
    expiresAt: Date;
  }): Promise<Alert> {
    const rows = await db.select().from(alertsTable);
    const existing = rows
      .find(
        a =>
          a.subscription.endpoint === data.subscription.endpoint &&
          a.keyword.toLowerCase() === data.keyword.toLowerCase(),
      );
    if (existing) return existing;

    const newAlert: NewAlert = {
      id: randomUUID(),
      keyword: data.keyword,
      subscription: data.subscription,
      expiresAt: data.expiresAt,
    };

    const [alert] = await db.insert(alertsTable).values(newAlert).returning();
    if (!alert) throw new Error('Insert returned no alert row');
    return alert;
  }

  async findByIds(ids: string[]): Promise<Alert[]> {
    const valid = ids.filter(isUuid);
    if (valid.length === 0) return [];
    return db.select().from(alertsTable).where(inArray(alertsTable.id, valid));
  }

  async deleteById(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await db.delete(alertsTable).where(eq(alertsTable.id, id));
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    const alerts = await db.select().from(alertsTable);
    const toDelete = alerts
      .filter(a => a.subscription.endpoint === endpoint);
    await Promise.all(toDelete.map(a => this.deleteById(a.id)));
  }

  async renewExpiry(id: string): Promise<Date> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRY_DAYS);
    if (isUuid(id)) {
      await db.update(alertsTable).set({ expiresAt }).where(eq(alertsTable.id, id));
    }
    return expiresAt;
  }

  /**
   * Sends a push to every active alert whose keyword appears in the deal.
   *
   * Price gate, per product: an alert that already notified this product only
   * fires again at a strictly lower price. Deals without a product (coupon-only)
   * or without a price always notify. Runs after product resolution (ingestion
   * notify step), so deal.productId is final.
   */
  async matchAndNotify(deal: Deal, logger: Logger): Promise<void> {
    const alerts = await db
      .select()
      .from(alertsTable)
      .where(gt(alertsTable.expiresAt, new Date()));

    const normalize = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const searchText = normalize(
      [deal.product, deal.description, deal.text].filter(Boolean).join(' '),
    );

    const matching = alerts.filter(alert => searchText.includes(normalize(alert.keyword)));
    if (matching.length === 0) return;

    const gated = deal.productId !== null && deal.price !== null;
    const lastPrices = new Map<string, number>();
    if (gated) {
      const rows = await db
        .select({
          alertId: alertProductNotificationsTable.alertId,
          price: alertProductNotificationsTable.lastNotifiedPrice,
        })
        .from(alertProductNotificationsTable)
        .where(and(
          eq(alertProductNotificationsTable.productId, deal.productId as string),
          inArray(alertProductNotificationsTable.alertId, matching.map(a => a.id)),
        ));
      for (const r of rows) lastPrices.set(r.alertId, r.price);
    }

    const toNotify = matching.filter(alert => {
      const last = lastPrices.get(alert.id);
      return last === undefined || (deal.price as number) < last;
    });

    const results = await Promise.allSettled(toNotify.map(alert => this.sendNotification(alert, deal, logger)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        logger.error('Failed to send notification', {
          alertId: toNotify[i]?.id,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  }

  private async sendNotification(alert: Alert, deal: Deal, logger: Logger): Promise<void> {
    const title = [deal.store, deal.product ?? deal.text]
      .filter(Boolean)
      .join(': ');

    const body = deal.price != null
      ? `R$ ${(deal.price / 100).toFixed(2).replace('.', ',')}`
      : 'Check out this deal';

    const result = await this.push.send(alert.subscription, {
      title,
      body,
      url: `/?search=${encodeURIComponent(alert.keyword)}`,
      tag: `bargah-alert-${alert.keyword}`,
      renotify: true,
      actions: [
        { action: 'view', title: 'Ver promoção' },
        { action: 'dismiss', title: 'Dispensar' },
      ],
    });

    if (result.ok) {
      if (deal.productId !== null && deal.price !== null) {
        await db
          .insert(alertProductNotificationsTable)
          .values({ alertId: alert.id, productId: deal.productId, lastNotifiedPrice: deal.price })
          .onConflictDoUpdate({
            target: [alertProductNotificationsTable.alertId, alertProductNotificationsTable.productId],
            set: { lastNotifiedPrice: deal.price, notifiedAt: new Date() },
          });
      }

      logger.info('Alert notification sent', { alertId: alert.id, keyword: alert.keyword });
    } else if (result.reason === 'recipient_gone') {
      await this.deleteById(alert.id);
      logger.info('Alert deleted — subscription gone', { alertId: alert.id });
    } else {
      logger.warn('Alert notification failed', { alertId: alert.id, reason: result.reason });
    }
  }
}

export default AlertService;
