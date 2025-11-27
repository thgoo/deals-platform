import type { AffiliateProvider } from './base';

class NaturaProvider implements AffiliateProvider {
  readonly name = 'natura';

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('natura.com.br');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      // Remove existing parameters
      urlObj.searchParams.delete('consultoria');

      // Add affiliate parameter
      urlObj.searchParams.set('consultoria', config);

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const naturaProvider = new NaturaProvider();
