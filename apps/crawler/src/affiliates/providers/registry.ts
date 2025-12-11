import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

class ProviderRegistry {
  private providers: AffiliateProvider[] = [];

  register(provider: AffiliateProvider): void {
    this.providers.push(provider);
    logger.debug(`Registered affiliate provider: ${provider.name}`);
  }

  findProvider(url: string): AffiliateProvider | null {
    for (const provider of this.providers) {
      if (provider.canHandle(url)) {
        return provider;
      }
    }
    return null;
  }

  getAll(): AffiliateProvider[] {
    return [...this.providers];
  }
}

export const providerRegistry = new ProviderRegistry();
