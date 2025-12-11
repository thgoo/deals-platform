import { zValidator } from '@hono/zod-validator';
import { EventEmitter } from 'events';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Deal } from '~/db/schemas/deals';
import { webhookAuth } from './middleware/webhook-auth';
import { createDealSchema, listDealsQuerySchema, updateImageSchema } from './schemas';

const app = new Hono();

const dealEvents = new EventEmitter();
dealEvents.setMaxListeners(10000);

app.post('/', webhookAuth, zValidator('json', createDealSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const body = c.req.valid('json');

  const exists = await dealService.exists(body.chat, body.message_id);
  if (exists) {
    logger.info('Deal already exists (deduped)', {
      chat: body.chat,
      messageId: body.message_id,
    });
    return c.json({ ok: true, deduped: true });
  }

  const deal = await dealService.create({
    messageId: body.message_id,
    chat: body.chat,
    chatId: body.chat_id,
    ts: new Date(body.ts),
    text: body.text,
    links: body.links,
    price: body.price || null,
    coupons: body.coupons,
    store: body.store || null,
    description: body.description || null,
    product: body.product || null,
    mediaType: body.media?.type,
    photoId: body.media?.photo_id ? String(body.media.photo_id) : undefined,
    localPath: body.media?.local_path,
  });

  logger.info('Deal created', {
    dealId: deal.id,
    chat: body.chat,
    messageId: body.message_id,
  });

  dealEvents.emit('new-deal', deal);

  return c.json({ ok: true, id: deal.id });
});

app.get('/', zValidator('query', listDealsQuerySchema), async c => {
  const dealService = c.get('dealService');
  const { limit, cursor, search, stores, hasCoupon } = c.req.valid('query');

  const cursorDate = cursor ? new Date(cursor) : undefined;

  const deals = await dealService.findWithFilters({
    limit: limit + 1,
    cursor: cursorDate,
    search,
    stores,
    hasCoupon,
  });

  const hasMore = deals.length > limit;
  const items = hasMore ? deals.slice(0, limit) : deals;

  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].ts.toISOString()
    : null;

  return c.json({
    items,
    nextCursor,
    hasMore,
  });
});

app.get('/stream', c => {
  const logger = c.get('logger');

  return streamSSE(c, async stream => {
    const handleNewDeal = (deal: Deal) => {
      stream.writeSSE({
        data: JSON.stringify(deal),
        event: 'new-deal',
        id: String(deal.id),
      });
    };

    const handleImageUpdated = (payload: { id: number; localPath: string }) => {
      stream.writeSSE({
        data: JSON.stringify(payload),
        event: 'image-updated',
        id: String(payload.id),
      });
    };

    dealEvents.on('new-deal', handleNewDeal);
    dealEvents.on('image-updated', handleImageUpdated);
    logger.info('SSE client connected');

    await stream.writeSSE({
      data: JSON.stringify({ connected: true }),
      event: 'connected',
    });

    stream.onAbort(() => {
      dealEvents.off('new-deal', handleNewDeal);
      dealEvents.off('image-updated', handleImageUpdated);
      logger.info('SSE client disconnected');
    });

    while (true) {
      await stream.sleep(30000);
      await stream.writeSSE({
        data: 'keepalive',
        event: 'ping',
      });
    }
  });
});

app.post('/image', webhookAuth, zValidator('json', updateImageSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const { photo_id, local_path } = c.req.valid('json');

  const deal = await dealService.updateImage(photo_id, local_path);

  if (deal) {
    logger.info('Image updated', { photoId: photo_id, path: local_path, dealId: deal.id });

    dealEvents.emit('image-updated', {
      id: deal.id,
      localPath: deal.localPath,
    });

    return c.json({ ok: true, updated: true, dealId: deal.id });
  }

  logger.warn('Photo ID not found', { photoId: photo_id });
  return c.json({ ok: true, updated: false });
});

app.get('/stores', async c => {
  const dealService = c.get('dealService');
  const { orderBy, sinceDays } = c.req.query();

  const orderByCount = orderBy !== 'name';
  const days = sinceDays ? parseInt(sinceDays, 10) : 3;
  const stores = await dealService.getAvailableStores(orderByCount, days);

  return c.json({
    stores,
  });
});

export default app;
