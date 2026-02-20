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
    provider.configure(config);
    providerRegistry.register(provider);
  }

  logger.info('Affiliate providers initialized', {
    count: providers.length,
  });
}

export { providerRegistry } from './registry';
export type { AffiliateProvider } from './base';
