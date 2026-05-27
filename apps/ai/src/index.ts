process.title = 'bargah-ai-service';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import embed from '~/capabilities/embed/embed';
import EmbedOrchestrator from '~/capabilities/embed/services/embed-orchestrator';
import extract from '~/capabilities/extract/extract';
import ExtractOrchestrator from '~/capabilities/extract/services/extract-orchestrator';
import judge from '~/capabilities/judge/judge';
import JudgeOrchestrator from '~/capabilities/judge/services/judge-orchestrator';
import { config } from '~/config';
import { HTTP_STATUS_CODE } from '~/constants/http';
import { type Logger, logger } from '~/logger';
import { requestLogger } from '~/middleware/request-logger';
import { createEmbeddingProvider, getActiveEmbeddingProviderName } from '~/providers/embedding/factory';
import { createLLMProvider } from '~/providers/llm/factory';
import { version } from '../package.json';

export function createApp({
  extractOrchestrator,
  embedOrchestrator,
  judgeOrchestrator,
  appLogger = logger,
  enableLogger = true,
}: {
  extractOrchestrator: ExtractOrchestrator;
  embedOrchestrator: EmbedOrchestrator;
  judgeOrchestrator: JudgeOrchestrator;
  appLogger?: Logger;
  enableLogger?: boolean;
}) {
  const app = new Hono({ strict: true });

  app.use('*', cors({ origin: '*', credentials: true }));

  if (enableLogger) app.use(requestLogger());

  app.use('*', async (c, next) => {
    c.set('extractOrchestrator', extractOrchestrator);
    c.set('embedOrchestrator', embedOrchestrator);
    c.set('judgeOrchestrator', judgeOrchestrator);
    c.set('logger', appLogger);
    await next();
  });

  app.route('/api/ai/extract', extract);
  app.route('/api/ai/embed', embed);
  app.route('/api/ai/judge', judge);

  app.get('/health', c => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      capabilities: {
        extract: { provider: config.LLM_PROVIDER },
        embed: { provider: getActiveEmbeddingProviderName() },
        judge: { provider: config.LLM_PROVIDER },
      },
    });
  });

  app.onError(async (err, c) => {
    const appErr = c.get('logger');

    if (err instanceof HTTPException) {
      const errMessage = await err.getResponse().text();
      return c.json({ message: errMessage }, { status: err.status });
    }

    appErr.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
    });

    const message = config.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

    return c.json({ message }, { status: HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR });
  });

  return app;
}

const llmProvider = createLLMProvider(config.LLM_PROVIDER);
const embeddingProvider = createEmbeddingProvider();

logger.info('AI service initialized', {
  llm: { provider: llmProvider.name, model: llmProvider.model },
  embedding: { provider: embeddingProvider.name, model: embeddingProvider.model },
});

const extractOrchestrator = new ExtractOrchestrator(llmProvider, logger);
const embedOrchestrator = new EmbedOrchestrator(embeddingProvider, logger);
const judgeOrchestrator = new JudgeOrchestrator(llmProvider, logger);

const app = createApp({
  extractOrchestrator,
  embedOrchestrator,
  judgeOrchestrator,
});

export default {
  port: config.PORT,
  fetch: app.fetch,
};
