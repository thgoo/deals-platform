import type { AffiliateConfig } from '../../config';
import { logger } from '../../logger';
import { providerRegistry } from './registry';
import { amazonProvider } from './amazon';
import { shopeeProvider } from './shopee';
import { mercadoLivreProvider } from './mercadolivre';
import { aliExpressProvider } from './aliexpress';
import { magaluProvider } from './magalu';
import { naturaProvider } from './natura';

/**
 * Initialize all affiliate providers
 * Call this once at startup
 */
export function initializeProviders(config: AffiliateConfig): void {
  // Register all providers
  providerRegistry.register(amazonProvider);
  providerRegistry.register(shopeeProvider);
  providerRegistry.register(mercadoLivreProvider);
  providerRegistry.register(magaluProvider);
  providerRegistry.register(naturaProvider);
  
  // AliExpress needs special initialization if API is configured
  const aliConfig = config.aliexpress;
  if (aliConfig && typeof aliConfig === 'object') {
    const { appKey, appSecret, trackingId } = aliConfig;
    if (appKey && appSecret && trackingId) {
      aliExpressProvider.configure(appKey, appSecret, trackingId);
      logger.info('AliExpress API configured');
    }
  }
  providerRegistry.register(aliExpressProvider);

  logger.info('Affiliate providers initialized', { 
    count: providerRegistry.getAll().length 
  });
}

export { providerRegistry } from './registry';
export type { AffiliateProvider } from './base';
