import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createAlertSchema, getAlertsQuerySchema } from './schemas';

const ALERT_EXPIRY_DAYS = 90;

const app = new Hono();

app.post('/', zValidator('json', createAlertSchema), async c => {
  const alertService = c.get('alertService');
  const { keyword, subscription } = c.req.valid('json');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ALERT_EXPIRY_DAYS);

  const alert = await alertService.create({ keyword, subscription, expiresAt });

  return c.json({ id: alert.id, keyword: alert.keyword, expiresAt: alert.expiresAt }, 201);
});

app.get('/', zValidator('query', getAlertsQuerySchema), async c => {
  const alertService = c.get('alertService');
  const ids = c.req.valid('query').ids.split(',').filter(Boolean);
  const alerts = await alertService.findByIds(ids);

  return c.json(alerts.map(a => ({
    id: a.id,
    keyword: a.keyword,
    expiresAt: a.expiresAt,
  })));
});

app.delete('/:id', async c => {
  const alertService = c.get('alertService');
  await alertService.deleteById(c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/:id/renew', async c => {
  const alertService = c.get('alertService');
  const expiresAt = await alertService.renewExpiry(c.req.param('id'));
  return c.json({ ok: true, expiresAt });
});

export default app;
