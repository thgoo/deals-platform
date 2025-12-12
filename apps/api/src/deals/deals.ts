import { zValidator } from '@hono/zod-validator';
import { EventEmitter } from 'events';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Deal } from '~/db/schemas/deals';
import { webhookAuth } from './middleware/webhook-auth';
import {
  createDealSchema,
  listDealsQuerySchema,
  updateImageSchema,
  updateLinksSchema,
  updateProductKeySchema,
} from './schemas';

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
    productKey: body.product_key || null,
    category: body.category || null,
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

app.get('/:id', async c => {
  const dealService = c.get('dealService');
  const id = parseInt(c.req.param('id'), 10);

  if (isNaN(id)) {
    return c.json({ error: 'Invalid deal ID' }, 400);
  }

  const deal = await dealService.findById(id);

  if (!deal) {
    return c.json({ error: 'Deal not found' }, 404);
  }

  return c.json(deal);
});

app.patch('/:id/links', webhookAuth, zValidator('json', updateLinksSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const id = parseInt(c.req.param('id'), 10);
  const { links } = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid deal ID' }, 400);
  }

  const deal = await dealService.updateLinks(id, links);

  if (!deal) {
    return c.json({ error: 'Deal not found' }, 404);
  }

  logger.info('Deal links updated', { dealId: id, linksCount: links.length });

  return c.json({ ok: true, id: deal.id, links: deal.links });
});

app.patch('/:id/product-key', webhookAuth, zValidator('json', updateProductKeySchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const id = parseInt(c.req.param('id'), 10);
  const { product_key, category } = c.req.valid('json');
  if (isNaN(id)) {
    return c.json({ error: 'Invalid deal ID' }, 400);
  }
  const deal = await dealService.updateProductKey(id, product_key ?? null, category ?? null);
  if (!deal) {
    return c.json({ error: 'Deal not found' }, 404);
  }
  logger.info('Deal product key updated', { dealId: id, productKey: product_key, category });
  return c.json({ ok: true, id: deal.id, productKey: deal.productKey, category: deal.category });
});

export default app;
