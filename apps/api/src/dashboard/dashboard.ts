import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { dashboardAuth } from './middleware/dashboard-auth';
import {
  daysQuerySchema,
  decisionsQuerySchema,
  duplicatesQuerySchema,
  timeseriesQuerySchema,
  topQuerySchema,
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

app.get('/catalog/duplicate-suspects', zValidator('query', duplicatesQuerySchema), c => {
  const { threshold, limit } = c.req.valid('query');
  const suspects = c.get('catalogStatsService').findDuplicateSuspects(threshold, limit);
  return c.json(suspects);
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

export default app;
