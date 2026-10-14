import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { embedRequestSchema } from './schemas';

const app = new Hono();

app.post('/', zValidator('json', embedRequestSchema), async c => {
  const orchestrator = c.get('embedOrchestrator');
  const input = c.req.valid('json');

  const result = await orchestrator.embed(input);
  return c.json(result);
});

export default app;
