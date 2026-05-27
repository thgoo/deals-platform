import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { extractRequestSchema } from './schemas';

const app = new Hono();

app.post('/', zValidator('json', extractRequestSchema), async c => {
  const orchestrator = c.get('extractOrchestrator');
  const input = c.req.valid('json');

  const result = await orchestrator.extract(input);
  return c.json(result);
});

export default app;
