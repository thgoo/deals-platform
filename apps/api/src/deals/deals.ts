import { zValidator } from '@hono/zod-validator';
import { EventEmitter } from 'events';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Deal } from '~/db/schemas/deals';
import { webhookAuth } from './middleware/webhook-auth';
import { createDealSchema, listDealsQuerySchema, updateImageSchema } from './schemas';

const app = new Hono();

/**
 * Event emitter para broadcast de deals em tempo real via SSE
 * Cada cliente SSE conectado = 1 listener
 */
const dealEvents = new EventEmitter();
dealEvents.setMaxListeners(10000);

/**
 * POST /api/deals
 * Webhook do crawler - cria novo deal
 * Equivalente: POST /api/webhooks/telegram (Next.js)
 */
app.post('/', webhookAuth, zValidator('json', createDealSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const body = c.req.valid('json');

  // Verificar duplicata (idempotência)
  const exists = await dealService.exists(body.chat, body.message_id);
  if (exists) {
    logger.info('Deal already exists (deduped)', {
      chat: body.chat,
      messageId: body.message_id,
    });
    return c.json({ ok: true, deduped: true });
  }

  // Criar deal
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

  // Broadcast para clientes SSE conectados
  dealEvents.emit('new-deal', deal);

  return c.json({ ok: true, id: deal.id });
});

/**
 * GET /api/deals
 * Lista deals com cursor-based pagination e filtros
 * Query params:
 *   - limit: número de itens (padrão: 16, máx: 100)
 *   - cursor: timestamp ISO do último deal carregado (opcional)
 *   - search: busca em text, product, description, store (opcional)
 *   - stores: lojas separadas por vírgula (opcional) - ex: "Amazon,Magalu,Kabum"
 *   - hasCoupon: true para filtrar apenas deals com cupom (opcional)
 *
 * Response:
 *   - items: array de deals
 *   - nextCursor: timestamp para próxima página (null se não houver mais)
 *   - hasMore: boolean indicando se há mais itens
 */
app.get('/', zValidator('query', listDealsQuerySchema), async c => {
  const dealService = c.get('dealService');
  const { limit, cursor, search, stores, hasCoupon } = c.req.valid('query');

  // Converter cursor string para Date se fornecido
  const cursorDate = cursor ? new Date(cursor) : undefined;

  // Buscar limit + 1 para saber se há mais itens
  const deals = await dealService.findWithFilters({
    limit: limit + 1,
    cursor: cursorDate,
    search,
    stores,
    hasCoupon,
  });

  // Verificar se há mais itens
  const hasMore = deals.length > limit;
  const items = hasMore ? deals.slice(0, limit) : deals;

  // Próximo cursor é o timestamp do último item retornado
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].ts.toISOString()
    : null;

  return c.json({
    items,
    nextCursor,
    hasMore,
  });
});

/**
 * GET /api/deals/stream
 * SSE endpoint para receber deals em tempo real
 *
 * Uso no frontend:
 * ```typescript
 * const eventSource = new EventSource('/api/deals/stream');
 * eventSource.addEventListener('new-deal', (event) => {
 *   const deal = JSON.parse(event.data);
 *   console.log('Novo deal:', deal);
 * });
 * ```
 */
app.get('/stream', c => {
  const logger = c.get('logger');

  return streamSSE(c, async stream => {
    // Handler para novos deals
    const handleNewDeal = (deal: Deal) => {
      stream.writeSSE({
        data: JSON.stringify(deal),
        event: 'new-deal',
        id: String(deal.id),
      });
    };

    // Handler para imagens atualizadas
    const handleImageUpdated = (payload: { id: number; localPath: string }) => {
      stream.writeSSE({
        data: JSON.stringify(payload),
        event: 'image-updated',
        id: String(payload.id),
      });
    };

    // Registrar listeners
    dealEvents.on('new-deal', handleNewDeal);
    dealEvents.on('image-updated', handleImageUpdated);
    logger.info('SSE client connected');

    // Enviar mensagem inicial
    await stream.writeSSE({
      data: JSON.stringify({ connected: true }),
      event: 'connected',
    });

    // Cleanup ao desconectar
    stream.onAbort(() => {
      dealEvents.off('new-deal', handleNewDeal);
      dealEvents.off('image-updated', handleImageUpdated);
      logger.info('SSE client disconnected');
    });

    // Loop infinito com keepalive integrado
    while (true) {
      await stream.sleep(30000); // Sleep 30s
      // Enviar ping para manter conexão
      await stream.writeSSE({
        data: 'keepalive',
        event: 'ping',
      });
    }
  });
});

/**
 * POST /api/deals/image
 * Webhook de imagem pronta (download concluído)
 * Equivalente: POST /api/webhooks/telegram/image (Next.js)
 */
app.post('/image', webhookAuth, zValidator('json', updateImageSchema), async c => {
  const dealService = c.get('dealService');
  const logger = c.get('logger');
  const { photo_id, local_path } = c.req.valid('json');

  const deal = await dealService.updateImage(photo_id, local_path);

  if (deal) {
    logger.info('Image updated', { photoId: photo_id, path: local_path, dealId: deal.id });

    // Broadcast apenas id e localPath via SSE
    dealEvents.emit('image-updated', {
      id: deal.id,
      localPath: deal.localPath,
    });

    return c.json({ ok: true, updated: true, dealId: deal.id });
  }

  logger.warn('Photo ID not found', { photoId: photo_id });
  return c.json({ ok: true, updated: false });
});

/**
 * GET /api/deals/stores
 * Lista todas as lojas disponíveis para filtros
 *
 * Query params:
 * - orderBy: 'count' (default) ou 'name' - ordenação das lojas
 *
 * Response:
 * - stores: array de strings com nomes de lojas
 */
app.get('/stores', async c => {
  const dealService = c.get('dealService');
  const { orderBy } = c.req.query();

  // Se orderBy=name, ordena alfabeticamente, caso contrário ordena por contagem
  const orderByCount = orderBy !== 'name';
  const stores = await dealService.getAvailableStores(orderByCount);

  return c.json({
    stores,
  });
});

export default app;
