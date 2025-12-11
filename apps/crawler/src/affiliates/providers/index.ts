import type { AffiliateConfig } from '../../config';
import { logger } from '../../logger';
import { aliExpressProvider } from './aliexpress';
import { amazonProvider } from './amazon';
import { awinProvider } from './awin';
import { magaluProvider } from './magalu';
import { mercadoLivreProvider } from './mercadolivre';
import { naturaProvider } from './natura';
import { providerRegistry } from './registry';
import { shopeeProvider } from './shopee';

export function initializeProviders(config: AffiliateConfig): void {
  const providers = [
    amazonProvider,
    shopeeProvider,
    mercadoLivreProvider,
    magaluProvider,
    naturaProvider,
    aliExpressProvider,
    awinProvider,
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

  const shopeeConfig = config.shopee;
  if (shopeeConfig && typeof shopeeConfig === 'object') {
    const { appId, secret } = shopeeConfig;
    if (appId && secret) {
      shopeeProvider.configure(appId, secret);
    }
  }

  logger.info('Affiliate providers initialized', {
    count: providerRegistry.getAll().length,
  });
}

export { providerRegistry } from './registry';
export type { AffiliateProvider } from './base';
