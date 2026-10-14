import { createDealSchema, updateImageSchema } from '@bargah/shared';
import type { DealsPageDto, ImageUpdatedEvent, StoresResponse } from '@bargah/shared';
import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import type { Deal } from '~/db/schemas/deals';
import MediaStore from '~/media/media-store';
import { toDealDto } from './dto';
import { dealEvents } from './events';
import { webhookAuth } from './middleware/webhook-auth';
import {
  listDealsQuerySchema,
  updateExtractedSchema,
  updateLinksSchema,
} from './schemas';

const app = new Hono();

/**
 * Intake from the crawler. Stores the message and answers at once (202); the
 * ingestion worker (src/ingest) runs link pipeline, AI extraction, product
 * matching and alerts afterwards, with retries. Re-sending the same message is
 * harmless: it's recognised and answered as deduped.
 */
app.post('/', webhookAuth, zValidator('json', createDealSchema), async c => {
  const rawMessages = c.get('rawMessageService');
  const logger = c.get('logger');
  const body = c.req.valid('json');

  const row = await rawMessages.receive(body);
  if (!row) {
    logger.info('Message already received (deduped)', { chat: body.chat, messageId: body.message_id });
    return c.json({ ok: true, deduped: true });
  }

  logger.info('Message queued', { rawId: row.id, chat: body.chat, messageId: body.message_id });
  return c.json({ ok: true, queued: true, id: row.id }, 202);
});

app.get('/', zValidator('query', listDealsQuerySchema), async c => {
  const dealService = c.get('dealService');
  const { limit, cursor, from, to, search, stores, hasCoupon } = c.req.valid('query');

  const cursorDate = cursor ? new Date(cursor) : undefined;

  const deals = await dealService.findWithFilters({
    limit: limit + 1,
    cursor: cursorDate,
    from,
    to,
    search,
    stores,
    hasCoupon,
  });

  const hasMore = deals.length > limit;
  const items = hasMore ? deals.slice(0, limit) : deals;

  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].ts.toISOString()
    : null;

  const page: DealsPageDto = {
    items: items.map(toDealDto),
    nextCursor,
    hasMore,
  };
  return c.json(page);
});

app.get('/stream', c => {
  const logger = c.get('logger');

  return streamSSE(c, async stream => {
    const handleNewDeal = (deal: Deal) => {
      stream.writeSSE({
        data: JSON.stringify(toDealDto(deal)),
        event: 'new-deal',
        id: String(deal.id),
      });
    };

    const handleImageUpdated = (payload: ImageUpdatedEvent) => {
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

/**
 * A deal photo finished downloading: attach it to the queued message (if the deal
 * doesn't exist yet the worker applies it on creation) and to the deal (if it does).
 */
async function applyPhoto(c: Context, photoId: string, localPath: string) {
  await c.get('rawMessageService').attachPhoto(photoId, localPath);
  const deal = await c.get('dealService').updateImage(photoId, localPath);

  if (deal) {
    c.get('logger').info('Image updated', { photoId, path: localPath, dealId: deal.id });
    dealEvents.imageUpdated({ id: deal.id, localPath: deal.localPath });
    return c.json({ ok: true, updated: true, dealId: deal.id });
  }

  c.get('logger').info('Photo stored for a deal not created yet', { photoId });
  return c.json({ ok: true, updated: false });
}

/** Crawler uploads a deal photo (raw image bytes); the api stores and serves it. */
app.put(
  '/photos/:photoId',
  webhookAuth,
  bodyLimit({ maxSize: 10 * 1024 * 1024 }),
  async c => {
    const photoId = c.req.param('photoId');
    if (!MediaStore.isValidPhotoId(photoId)) {
      return c.json({ message: 'Invalid photo id' }, 400);
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return c.json({ message: 'Empty body' }, 400);

    const localPath = await c.get('mediaStore').savePhoto(photoId, bytes);
    return applyPhoto(c, photoId, localPath);
  },
);

/** Older crawlers wrote the file themselves and only notify the path. */
app.post('/image', webhookAuth, zValidator('json', updateImageSchema), async c => {
  const { photo_id, local_path } = c.req.valid('json');
  return applyPhoto(c, photo_id, local_path);
});

app.get('/price-history/:productId', async c => {
  const dealService = c.get('dealService');
  const productId = c.req.param('productId');

  const history = await dealService.getPriceHistory(productId);

  if (!history) {
    return c.json({ error: 'No price history found for this product' }, 404);
  }

  return c.json(history);
});

app.get('/stores', async c => {
  const dealService = c.get('dealService');
  const { orderBy, sinceDays } = c.req.query();

  const orderByCount = orderBy !== 'name';
  const days = sinceDays ? parseInt(sinceDays, 10) : 3;
  const stores = await dealService.getAvailableStores(orderByCount, days);

  const body: StoresResponse = { stores };
  return c.json(body);
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

  return c.json(toDealDto(deal));
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

app.patch('/:id/extracted', webhookAuth, zValidator('json', updateExtractedSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const id = parseInt(c.req.param('id'), 10);
  const body = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid deal ID' }, 400);
  }

  const deal = await dealService.updateExtracted(id, {
    text: body.text,
    description: body.description,
    product: body.product,
    store: body.store,
    price: body.price,
    coupons: body.coupons,
    category: body.category,
  });

  if (!deal) {
    return c.json({ error: 'Deal not found' }, 404);
  }

  logger.info('Deal reprocessed', { dealId: id, product: body.product, store: body.store });

  return c.json({ ok: true, id: deal.id });
});

export default app;
