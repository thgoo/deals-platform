import type { AffiliateConfig } from '../../config';
import { logger } from '../../logger';
import { aliExpressProvider } from './aliexpress';
import { amazonProvider } from './amazon';
import { magaluProvider } from './magalu';
import { mercadoLivreProvider } from './mercadolivre';
import { naturaProvider } from './natura';
import { providerRegistry } from './registry';
import { shopeeProvider } from './shopee';

/**
 * Initialize all affiliate providers
 * Call this once at startup
 */
export function initializeProviders(config: AffiliateConfig): void {
  const providers = [
    amazonProvider,
    shopeeProvider,
    mercadoLivreProvider,
    magaluProvider,
    naturaProvider,
    aliExpressProvider,
  ];
  for (const provider of providers) {
    providerRegistry.register(provider);
  }

  const aliConfig = config.aliexpress;
  if (aliConfig && typeof aliConfig === 'object') {
    const { appKey, appSecret, trackingId } = aliConfig;
    if (appKey && appSecret && trackingId) {
      aliExpressProvider.configure(appKey, appSecret, trackingId);
    }
  }

  logger.info('Affiliate providers initialized', {
    count: providerRegistry.getAll().length,
  });
}

export { providerRegistry } from './registry';
export type { AffiliateProvider } from './base';
