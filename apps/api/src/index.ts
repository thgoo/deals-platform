process.title = 'bargah-api';

import AiServiceClient from '~/ai-service-client';
import { createApp } from '~/app';
import { config } from '~/config';
import CatalogStatsService from '~/dashboard/services/catalog-stats-service';
import { logger } from '~/logger';
import CandidateSearchService from '~/products/services/candidate-search-service';
import DecisionService from '~/products/services/decision-service';
import ProductResolverService from '~/products/services/product-resolver-service';
import ProductService from '~/products/services/product-service';
import UrlMappingService from '~/products/services/url-mapping-service';

// Bootstrap: build the product resolver once, pre-warm the in-memory candidate
// cache before accepting traffic, then hand control over to Hono. Keeping this
// bootstrap separate from `createApp` (in app.ts) lets tests import the factory
// without paying for `loadAll()` against a real database.

const aiServiceClient = new AiServiceClient();
const productService = new ProductService();
const candidateSearchService = new CandidateSearchService(productService, logger);
await candidateSearchService.loadAll();

const productResolverService = new ProductResolverService(
  productService,
  new UrlMappingService(),
  new DecisionService(),
  candidateSearchService,
  aiServiceClient,
  logger,
);

// Dashboard's duplicate-suspects feature reuses the resolver's loaded cache —
// O(N²) scan over the same embeddings without paying for a second load.
const catalogStatsService = new CatalogStatsService(candidateSearchService);

const app = createApp({ aiServiceClient, productResolverService, catalogStatsService });

export default {
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};
