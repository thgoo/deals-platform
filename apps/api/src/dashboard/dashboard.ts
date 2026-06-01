import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dashboardAuth } from './middleware/dashboard-auth';
import {
  anomaliesQuerySchema,
  cleanProductBodySchema,
  daysQuerySchema,
  dealIdParamSchema,
  decisionsQuerySchema,
  priceLeadersQuerySchema,
  timeseriesQuerySchema,
  topQuerySchema,
  updateDealBodySchema,
  updateProductNameBodySchema,
} from './schemas';

const app = new Hono();

// Every route below requires the secret header.
app.use('*', dashboardAuth);

app.get('/heartbeat', async c => {
  const stats = await c.get('heartbeatService').getStats();
  return c.json(stats);
});

app.get('/catalog/overview', async c => {
  const stats = await c.get('catalogStatsService').getOverview();
  return c.json(stats);
});

app.get('/catalog/match-methods', zValidator('query', daysQuerySchema), async c => {
  const { days } = c.req.valid('query');
  const stats = await c.get('catalogStatsService').getMatchMethodStats(days);
  return c.json(stats);
});

app.get('/catalog/decisions', zValidator('query', decisionsQuerySchema), async c => {
  const { limit } = c.req.valid('query');
  const decisions = await c.get('catalogStatsService').getRecentDecisions(limit);
  return c.json(decisions);
});

app.get('/catalog/sources', async c => {
  const sources = await c.get('catalogStatsService').getSourceDistribution();
  return c.json(sources);
});

app.get('/business/top-stores', zValidator('query', topQuerySchema), async c => {
  const { days, limit } = c.req.valid('query');
  const list = await c.get('businessStatsService').getTopStores(days, limit);
  return c.json(list);
});

app.get('/business/top-categories', zValidator('query', topQuerySchema), async c => {
  const { days, limit } = c.req.valid('query');
  const list = await c.get('businessStatsService').getTopCategories(days, limit);
  return c.json(list);
});

app.get('/business/deals-timeseries', zValidator('query', timeseriesQuerySchema), async c => {
  const { days } = c.req.valid('query');
  const series = await c.get('businessStatsService').getDealsTimeSeries(days);
  return c.json(series);
});

app.get('/catalog/price-leaders', zValidator('query', priceLeadersQuerySchema), async c => {
  const { limit, minDeals } = c.req.valid('query');
  const leaders = await c.get('priceStatsService').getPriceLeaders(limit, minDeals);
  return c.json(leaders);
});

app.get('/catalog/price-history/:productId', async c => {
  const history = await c.get('priceStatsService').getPriceHistory(c.req.param('productId'));
  return c.json(history);
});

app.get('/catalog/anomalies', zValidator('query', anomaliesQuerySchema), async c => {
  const { limit, minDeals } = c.req.valid('query');
  const anomalies = await c.get('catalogCleanupService').getAnomalies(minDeals, limit);
  return c.json(anomalies);
});

app.get('/catalog/products/:productId/analyze', async c => {
  const analysis = await c.get('catalogCleanupService').analyzeProduct(c.req.param('productId'));
  if (!analysis) return c.json({ message: 'Not Found' }, 404);
  return c.json(analysis);
});

app.post('/catalog/products/:productId/clean', zValidator('json', cleanProductBodySchema), async c => {
  const { dealIds } = c.req.valid('json');
  const result = await c.get('catalogCleanupService').cleanProduct(c.req.param('productId'), dealIds);
  return c.json(result);
});

app.patch(
  '/deals/:dealId',
  zValidator('param', dealIdParamSchema),
  zValidator('json', updateDealBodySchema),
  async c => {
    const { dealId } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await c.get('catalogCleanupService').updateDeal(dealId, body);
    return c.json(result);
  },
);

app.delete('/deals/:dealId', zValidator('param', dealIdParamSchema), async c => {
  const { dealId } = c.req.valid('param');
  const result = await c.get('catalogCleanupService').deleteDeal(dealId);
  return c.json(result);
});

app.patch(
  '/catalog/products/:productId',
  zValidator('json', updateProductNameBodySchema),
  async c => {
    const { canonicalName } = c.req.valid('json');
    const result = await c.get('catalogCleanupService').updateProductName(c.req.param('productId'), canonicalName);
    return c.json(result);
  },
);

// Invalidates the heavy dashboard caches. Called once when the review modal
// closes after edits — keeps the inline mutations snappy (no inline recompute).
app.post('/cache/invalidate', async c => {
  c.get('catalogCleanupService').invalidateCaches();
  c.get('priceStatsService').invalidateCaches();
  c.get('catalogStatsService').invalidateCaches();
  return c.json({ ok: true });
});

export default app;
