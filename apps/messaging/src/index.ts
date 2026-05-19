import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { config } from './config';
import { NotificationDispatcher } from './dispatcher';
import { WebPushChannel } from './channels/web-push';
import { logger } from './logger';
import { testRoutes } from './test-routes';

const dispatcher = new NotificationDispatcher()
  .register(new WebPushChannel(config.vapid));

const notifySchema = z.object({
  recipient: z.object({
    type: z.literal('web-push'),
    subscription: z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string(),
        auth: z.string(),
      }),
    }),
  }),
  message: z.object({
    title: z.string(),
    body: z.string(),
    url: z.string().optional(),
    imageUrl: z.string().optional(),
    tag: z.string().optional(),
    renotify: z.boolean().optional(),
    actions: z.array(z.object({ action: z.string(), title: z.string() })).optional(),
  }),
});

const app = new Hono();

app.post('/notify', zValidator('json', notifySchema), async (c) => {
  const { recipient, message } = c.req.valid('json');
  const result = await dispatcher.send(recipient as any, message);

  if (result.ok) {
    logger.info('Notification sent', { channel: recipient.type });
  } else {
    logger.warn('Notification failed', { channel: recipient.type, reason: result.reason });
  }

  return c.json(result);
});

app.get('/health', (c) => c.json({ ok: true }));

if (process.env.NODE_ENV !== 'production') {
  app.route('/test', testRoutes);
  logger.info('Test routes enabled at /test');
}

const port = config.port;
logger.info(`Messaging service running`, { port });

export default {
  port,
  fetch: app.fetch,
};
