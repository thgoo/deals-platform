import type { AffiliateProvider } from './base';

class MagaluProvider implements AffiliateProvider {
  readonly name = 'magalu';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    const knownDomains = [
      'magazineluiza.com.br',
      'magalu.',
      'magazinevoce.com.br',
    ];
    return knownDomains.some(domain => urlLower.includes(domain));
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      const pathMatch = urlObj.pathname.match(/^\/([^/]+)(\/.*)/);

      if (!pathMatch) {
        return null;
      }

      urlObj.pathname = `/${config}${pathMatch[2]}`;

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const magaluProvider = new MagaluProvider();
