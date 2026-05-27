import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { judgeRequestSchema } from './schemas';

const app = new Hono();

app.post('/', zValidator('json', judgeRequestSchema), async c => {
  const orchestrator = c.get('judgeOrchestrator');
  const input = c.req.valid('json');

  const result = await orchestrator.judge(input);
  return c.json(result);
});

export default app;
