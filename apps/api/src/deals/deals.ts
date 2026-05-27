import { zValidator } from '@hono/zod-validator';
import { EventEmitter } from 'events';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Deal } from '~/db/schemas/deals';
import { webhookAuth } from './middleware/webhook-auth';
import {
  createDealSchema,
  listDealsQuerySchema,
  updateExtractedSchema,
  updateImageSchema,
  updateLinksSchema,
  updateProductKeySchema,
} from './schemas';
import { cleanPromoText } from './text-cleaner';

const app = new Hono();

const dealEvents = new EventEmitter();
dealEvents.setMaxListeners(10000);

app.post('/', webhookAuth, zValidator('json', createDealSchema), async c => {
  const dealService = c.get('dealService');
  const linkPipeline = c.get('linkPipelineService');
  const aiService = c.get('aiServiceClient');
  const productResolver = c.get('productResolverService');
  const alertService = c.get('alertService');
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

  const cleanedText = cleanPromoText(body.text);

  // Heuristic: a message with no link (either in body.links or inline in the text)
  // AND no money-like number is almost never a deal. Skipping it here avoids paying
  // for link-pipeline + AI extraction on noise.
  //
  // Reason for checking the text directly:
  //   - body.links carries Telegram's MessageEntity-parsed URLs only. Channels that
  //     paste a bare URL after an emoji (e.g. "🔗 https://...") often don't get the
  //     entity, so body.links is empty even though the text has a real link.
  //   - The price check used to require "R$" but many channels write Brazilian
  //     prices without the prefix ("DE 207,04 | POR 55,90"). Detect any decimal-2
  //     pattern instead, which covers all common cases without false positives.
  const hasLink = body.links.length > 0 || /https?:\/\//i.test(cleanedText);
  const hasMoneyLike = /\b\d+[,.]\d{2}\b/.test(cleanedText);

  if (!hasLink && !hasMoneyLike) {
    logger.info('Message has no link and no money-like pattern, skipping', {
      chat: body.chat,
      messageId: body.message_id,
    });
    return c.json({ ok: true, skipped: 'no-links-no-price' });
  }

  const linkResult = await linkPipeline.process({
    text: cleanedText,
    knownLinks: body.links,
  });

  // AI extraction. After ai-service exhausts its internal retries, this still throws
  // — at that point we drop the deal: a row with no product / price / category is
  // useless for the feed and the catalog, and would just pollute the table.
  let extraction: Awaited<ReturnType<typeof aiService.extract>>;
  try {
    extraction = await aiService.extract({
      text: cleanedText,
      chat: body.chat,
      messageId: body.message_id,
      links: linkResult.allVersions,
    });
  } catch (err) {
    logger.error('AI extraction failed after retries; skipping deal', {
      chat: body.chat,
      messageId: body.message_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ ok: true, skipped: 'extraction_failed' });
  }

  // Second-level filter: even when the AI returned a result, if it found no
  // product, no price, AND no coupon, the message is not a deal — channel
  // chatter, off-topic, links to neutral sites. Persisting these would pollute
  // the feed and risk firing alert notifications against irrelevant text.
  const hasCommercialSignal
    = extraction.product !== null
    || extraction.price !== null
    || extraction.coupons.length > 0;

  if (!hasCommercialSignal) {
    logger.info('AI returned no product, price, or coupon — skipping (not a deal)', {
      chat: body.chat,
      messageId: body.message_id,
    });
    return c.json({ ok: true, skipped: 'not-a-deal' });
  }

  // Coupon-only deals (no product extracted, only coupons) use a branded image
  // instead of whatever photo the Telegram channel attached — the channel's
  // photo is usually generic chatter or off-topic. The image lives at
  // `media/coupon.png` and is served by the same media route as real deal photos.
  // The late-arriving Telegram photo notification is ignored by `updateImage`
  // because the local_path is already set (see deal-service.updateImage).
  const isCouponOnly = extraction.product === null && extraction.coupons.length > 0;
  const localPath = isCouponOnly ? 'coupon.png' : body.media?.local_path;

  const deal = await dealService.create({
    messageId: body.message_id,
    chat: body.chat,
    chatId: body.chat_id,
    ts: new Date(body.ts),
    text: cleanedText,
    links: linkResult.finalLinks,
    price: extraction.price,
    coupons: extraction.coupons,
    store: extraction.store,
    description: extraction.description,
    product: extraction.product,
    productKey: extraction.productKey,
    category: extraction.category,
    mediaType: body.media?.type,
    photoId: body.media?.photo_id ? String(body.media.photo_id) : undefined,
    localPath,
  });

  logger.info('Deal created', {
    dealId: deal.id,
    chat: body.chat,
    messageId: body.message_id,
  });

  dealEvents.emit('new-deal', deal);

  alertService.matchAndNotify(deal, logger).catch(err =>
    logger.error('Alert matching failed', { dealId: deal.id, error: err.message }),
  );

  // Async product resolution — fire-and-forget. Does not block the response.
  // The resolver writes back deal.product_id when (and if) a product is matched.
  productResolver.resolve({
    dealId: deal.id,
    product: deal.product,
    category: deal.category,
    externalIds: linkResult.externalIds,
  })
    .then(async result => {
      if (result.productId) {
        await dealService.updateProductId(deal.id, result.productId);
      }
    })
    .catch(err =>
      logger.error('Product resolution failed', { dealId: deal.id, error: err.message }),
    );

  return c.json({ ok: true, id: deal.id });
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

app.get('/price-history/:productKey', async c => {
  const dealService = c.get('dealService');
  const productKey = c.req.param('productKey');

  const history = await dealService.getPriceHistory(productKey);

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
    productKey: body.product_key,
    category: body.category,
  });

  if (!deal) {
    return c.json({ error: 'Deal not found' }, 404);
  }

  logger.info('Deal reprocessed', { dealId: id, product: body.product, store: body.store });

  return c.json({ ok: true, id: deal.id });
});

export default app;
