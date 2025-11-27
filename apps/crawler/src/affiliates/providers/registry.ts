import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

/**
 * Registry for affiliate providers
 * Manages provider registration and lookup
 */
class ProviderRegistry {
  private providers: AffiliateProvider[] = [];

  /**
   * Register a provider
   */
  register(provider: AffiliateProvider): void {
    this.providers.push(provider);
    logger.debug(`Registered affiliate provider: ${provider.name}`);
  }

  /**
   * Find a provider that can handle the given URL
   * Returns first matching provider
   */
  findProvider(url: string): AffiliateProvider | null {
    for (const provider of this.providers) {
      if (provider.canHandle(url)) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Get all registered providers
   */
  getAll(): AffiliateProvider[] {
    return [...this.providers];
  }
}

export const providerRegistry = new ProviderRegistry();
