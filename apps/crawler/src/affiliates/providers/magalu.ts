import type { AffiliateProvider } from './base';

class MagaluProvider implements AffiliateProvider {
  readonly name = 'magalu';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('magazineluiza.com.br') || urlLower.includes('magalu.');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      // Remove existing parameters
      urlObj.searchParams.delete('partner_id');

      // Add affiliate parameter
      urlObj.searchParams.set('partner_id', config);

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const magaluProvider = new MagaluProvider();
