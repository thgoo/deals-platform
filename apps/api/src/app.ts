import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import AiServiceClient from '~/ai-service-client';
import alerts from '~/alerts/alerts';
import AlertService from '~/alerts/services/alert-service';
import auth from '~/auth';
import PasswordService from '~/auth/services/password-service';
import SessionService from '~/auth/services/session-service';
import UserService from '~/auth/services/user-service';
import { config } from '~/config';
import { HTTP_STATUS_CODE } from '~/constants/http';
import dashboard from '~/dashboard/dashboard';
import BusinessStatsService from '~/dashboard/services/business-stats-service';
import CatalogCleanupService from '~/dashboard/services/catalog-cleanup-service';
import CatalogStatsService from '~/dashboard/services/catalog-stats-service';
import HeartbeatService from '~/dashboard/services/heartbeat-service';
import PriceStatsService from '~/dashboard/services/price-stats-service';
import deals from '~/deals/deals';
import DealService from '~/deals/services/deal-service';
import { getAffiliateConfig } from '~/link-pipeline/config';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { buildRewriterRegistry } from '~/link-pipeline/rewriters/registry';
import LinkPipelineService from '~/link-pipeline/services/link-pipeline-service';
import { ConsoleLogger, logger } from '~/logger';
import { requestLogger } from '~/middleware/request-logger';
import CandidateSearchService from '~/products/services/candidate-search-service';
import DecisionService from '~/products/services/decision-service';
import ProductResolverService from '~/products/services/product-resolver-service';
import ProductService from '~/products/services/product-service';
import UrlMappingService from '~/products/services/url-mapping-service';
import { HttpError } from '~/utils/errors';

/**
 * Builds a ProductResolverService wired with default in-memory dependencies.
 *
 * NOTE: the returned resolver is usable but its candidate cache is empty —
 * production code in `index.ts` calls `loadAll()` explicitly before serving traffic.
 * This default exists so that tests (which inject mocks) and ad-hoc usage compile cleanly.
 */
function buildDefaultProductResolver(aiClient: AiServiceClient): ProductResolverService {
  const products = new ProductService();
  const candidateSearch = new CandidateSearchService(products, logger);
  return new ProductResolverService(
    products,
    new UrlMappingService(),
    new DecisionService(),
    candidateSearch,
    aiClient,
    logger,
  );
}

function buildDefaultLinkPipeline(): LinkPipelineService {
  const rewriters = buildRewriterRegistry(getAffiliateConfig());
  const identifiers = buildIdentifierRegistry();
  return new LinkPipelineService(rewriters, identifiers, logger);
}

export function createApp({
  alertService = new AlertService(),
  userService = new UserService(),
  sessionService = new SessionService(),
  passwordService = new PasswordService(),
  dealService = new DealService(),
  aiServiceClient = new AiServiceClient(),
  linkPipelineService = buildDefaultLinkPipeline(),
  productResolverService = buildDefaultProductResolver(aiServiceClient),
  heartbeatService = new HeartbeatService(),
  catalogStatsService = new CatalogStatsService(),
  businessStatsService = new BusinessStatsService(),
  priceStatsService = new PriceStatsService(),
  catalogCleanupService = new CatalogCleanupService(),
  appLogger = new ConsoleLogger(),
  enableLogger = true,
} = {}) {
  const app = new Hono({ strict: true });

  app.use('*', cors({
    origin: config.CORS_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
  }));

  if (process.env['NODE_ENV'] === 'production') {
    // CSRF only protects cookie-authenticated, browser-submitted routes. The
    // dashboard API is authenticated by the X-Dashboard-Secret header (which a
    // cross-site browser cannot set), so CSRF can't apply — and the global
    // middleware was wrongly 403'ing server-to-server calls from the web app
    // that carry no Origin header (e.g. the catalog-cleanup mutations).
    const csrfMiddleware = csrf({ origin: config.CORS_ORIGINS.split(',').map(o => o.trim()) });
    app.use('*', async (c, next) => {
      if (c.req.path.startsWith('/api/dashboard')) return next();
      return csrfMiddleware(c, next);
    });
  }
  if (enableLogger) app.use(requestLogger());

  app.use('*', async (c, next) => {
    c.set('alertService', alertService);
    c.set('userService', userService);
    c.set('sessionService', sessionService);
    c.set('passwordService', passwordService);
    c.set('dealService', dealService);
    c.set('aiServiceClient', aiServiceClient);
    c.set('linkPipelineService', linkPipelineService);
    c.set('productResolverService', productResolverService);
    c.set('heartbeatService', heartbeatService);
    c.set('catalogStatsService', catalogStatsService);
    c.set('businessStatsService', businessStatsService);
    c.set('priceStatsService', priceStatsService);
    c.set('catalogCleanupService', catalogCleanupService);
    c.set('logger', appLogger);
    await next();
  });

  app.route('/api/alerts', alerts);
  app.route('/api/auth', auth);
  app.route('/api/dashboard', dashboard);
  app.route('/api/deals', deals);

  app.onError(async (err, c) => {
    const appErr = c.get('logger');

    if (err instanceof HttpError) {
      return c.json({ message: err.message }, { status: err.statusCode as ContentfulStatusCode });
    }

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
