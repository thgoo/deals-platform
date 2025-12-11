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

      urlObj.searchParams.delete('consultoria');

      urlObj.searchParams.set('consultoria', config);

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const naturaProvider = new NaturaProvider();
