import { randomUUID } from 'crypto';
import { eq, gt, inArray } from 'drizzle-orm';
import { config } from '~/config';
import db from '~/db';
import { alertsTable } from '~/db/schemas/alerts';
import type { Alert, NewAlert, PushSubscription } from '~/db/schemas/alerts';
import type { Deal } from '~/db/schemas/deals';
import type { Logger } from '~/logger';

const ALERT_EXPIRY_DAYS = 90;

export class AlertService {
  async create(data: {
    keyword: string;
    subscription: PushSubscription;
    expiresAt: Date;
  }): Promise<Alert> {
    const newAlert: NewAlert = {
      id: randomUUID(),
      keyword: data.keyword,
      subscription: data.subscription,
      expiresAt: data.expiresAt,
    };

    await db.insert(alertsTable).values(newAlert);

    const [alert] = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.id, newAlert.id));

    return alert;
  }

  private parseAlert(alert: Alert): Alert {
    return {
      ...alert,
      subscription: typeof alert.subscription === 'string'
        ? JSON.parse(alert.subscription)
        : alert.subscription,
    };
  }

  async findByIds(ids: string[]): Promise<Alert[]> {
    if (ids.length === 0) return [];
    const rows = await db.select().from(alertsTable).where(inArray(alertsTable.id, ids));
    return rows.map(a => this.parseAlert(a));
  }

  async deleteById(id: string): Promise<void> {
    await db.delete(alertsTable).where(eq(alertsTable.id, id));
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    const alerts = await db.select().from(alertsTable);
    const toDelete = alerts
      .map(a => this.parseAlert(a))
      .filter(a => a.subscription.endpoint === endpoint);
    await Promise.all(toDelete.map(a => this.deleteById(a.id)));
  }

  async renewExpiry(id: string): Promise<Date> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRY_DAYS);
    await db.update(alertsTable).set({ expiresAt }).where(eq(alertsTable.id, id));
    return expiresAt;
  }

  async matchAndNotify(deal: Deal, logger: Logger): Promise<void> {
    const now = new Date();
    const rows = await db
      .select()
      .from(alertsTable)
      .where(gt(alertsTable.expiresAt, now));
    const alerts = rows.map(a => this.parseAlert(a));

    const searchText = [deal.product, deal.description, deal.text]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    for (const alert of alerts) {
      if (!searchText.includes(alert.keyword.toLowerCase())) continue;

      // Skip if new price is same or higher than last notified price
      if (
        deal.price != null &&
        alert.lastNotifiedPrice != null &&
        deal.price >= alert.lastNotifiedPrice
      ) continue;

      this.sendNotification(alert, deal, logger).catch(err =>
        logger.error('Failed to send notification', { alertId: alert.id, error: err.message })
      );
    }
  }

  private async sendNotification(alert: Alert, deal: Deal, logger: Logger): Promise<void> {
    const title = [deal.store, deal.product ?? deal.text]
      .filter(Boolean)
      .join(': ');

    const body = deal.price != null
      ? `R$ ${(deal.price / 100).toFixed(2).replace('.', ',')}`
      : 'Check out this deal';

    const response = await fetch(`${config.MESSAGING_SERVICE_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { type: 'web-push', subscription: alert.subscription },
        message: {
          title: `🔔 ${title}`,
          body,
          url: `/?search=${encodeURIComponent(alert.keyword)}`,
          tag: `bargah-alert-${alert.keyword}`,
          renotify: true,
          actions: [
            { action: 'view', title: 'Ver promoção' },
            { action: 'dismiss', title: 'Dispensar' },
          ],
        },
      }),
    });

    const result = await response.json() as { ok: boolean; reason?: string };

    if (result.ok) {
      await db
        .update(alertsTable)
        .set({ lastNotifiedPrice: deal.price ?? null })
        .where(eq(alertsTable.id, alert.id));

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
