process.title = 'bargah-api';

import { InProcessAiService } from '~/ai/ai-service';
import AlertService from '~/alerts/services/alert-service';
import { createApp } from '~/app';
import { config } from '~/config';
import { dealEvents } from '~/deals/events';
import DealService from '~/deals/services/deal-service';
import IngestPipeline from '~/ingest/pipeline';
import RawMessageService from '~/ingest/raw-message-service';
import IngestWorker from '~/ingest/worker';
import { getAffiliateConfig } from '~/link-pipeline/config';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { buildRewriterRegistry } from '~/link-pipeline/rewriters/registry';
import LinkPipelineService from '~/link-pipeline/services/link-pipeline-service';
import { logger } from '~/logger';
import CandidateSearchService from '~/products/services/candidate-search-service';
import DecisionService from '~/products/services/decision-service';
import ProductResolverService from '~/products/services/product-resolver-service';
import ProductService from '~/products/services/product-service';
import UrlMappingService from '~/products/services/url-mapping-service';

// Bootstrap: wire the shared instances, start the ingestion worker, hand
// control to Hono. Kept separate from `createApp` (app.ts) so tests can import
// the factory without connecting to anything or starting background work.

const aiService = new InProcessAiService();
const dealService = new DealService();
const alertService = new AlertService();
const decisionService = new DecisionService();
const rawMessageService = new RawMessageService();
const linkPipelineService = new LinkPipelineService(
  buildRewriterRegistry(getAffiliateConfig()),
  buildIdentifierRegistry(),
  logger,
);

const productResolverService = new ProductResolverService(
  new ProductService(),
  new UrlMappingService(),
  decisionService,
  new CandidateSearchService(),
  aiService,
  logger,
);

const worker = new IngestWorker(
  rawMessageService,
  new IngestPipeline({
    deals: dealService,
    links: linkPipelineService,
    ai: aiService,
    resolver: productResolverService,
    decisions: decisionService,
    alerts: alertService,
    findRawMessage: id => rawMessageService.findById(id),
    events: dealEvents,
    logger,
  }),
  logger,
);
worker.start();

const app = createApp({
  aiService,
  dealService,
  alertService,
  rawMessageService,
  linkPipelineService,
  productResolverService,
});

// Let in-flight ingestion steps finish on restart (PM2 sends SIGINT, then
// SIGKILL after its kill_timeout). Anything cut short is retried after its lease.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info('Shutting down: waiting for in-flight ingestion steps');
    worker.stop().finally(() => process.exit(0));
  });
}

export default {
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};
