import type { AffiliateProvider } from './base';

class ShopeeProvider implements AffiliateProvider {
  readonly name = 'shopee';

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('shopee.com.br');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      // Remove existing parameters
      urlObj.searchParams.delete('af_siteid');
      urlObj.searchParams.delete('utm_source');

      // Add affiliate parameters
      urlObj.searchParams.set('af_siteid', config);
      urlObj.searchParams.set('utm_source', `an_${config}`);
      urlObj.searchParams.set('utm_medium', 'affiliates');

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const shopeeProvider = new ShopeeProvider();
