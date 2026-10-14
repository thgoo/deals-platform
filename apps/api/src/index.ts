process.title = 'bargah-api';

import { InProcessAiService } from '~/ai/ai-service';
import { createApp } from '~/app';
import { config } from '~/config';
import { logger } from '~/logger';
import CandidateSearchService from '~/products/services/candidate-search-service';
import DecisionService from '~/products/services/decision-service';
import ProductResolverService from '~/products/services/product-resolver-service';
import ProductService from '~/products/services/product-service';
import UrlMappingService from '~/products/services/url-mapping-service';

// Bootstrap: wire the services that need shared instances, then hand control
// to Hono. Kept separate from `createApp` (app.ts) so tests can import the
// factory without connecting to anything.

const aiService = new InProcessAiService();

const productResolverService = new ProductResolverService(
  new ProductService(),
  new UrlMappingService(),
  new DecisionService(),
  new CandidateSearchService(),
  aiService,
  logger,
);

const app = createApp({ aiService, productResolverService });

export default {
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};
