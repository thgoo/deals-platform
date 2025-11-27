import type { AffiliateProvider } from './base';

class MercadoLivreProvider implements AffiliateProvider {
  readonly name = 'mercadolivre';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('mercadolivre.com.br') || urlLower.includes('mercadolibre.');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      // Skip non-product links
      if (urlObj.pathname.includes('/social/') ||
          urlObj.pathname.includes('/stores/') ||
          urlObj.pathname.includes('/ofertas/')) {
        return null;
      }

      // Remove existing parameters
      urlObj.searchParams.delete('pdp_source');

      // Add affiliate parameter
      urlObj.searchParams.set('pdp_source', config);

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const mercadoLivreProvider = new MercadoLivreProvider();
