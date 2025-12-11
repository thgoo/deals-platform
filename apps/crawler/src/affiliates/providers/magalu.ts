import type { AffiliateProvider } from './base';

interface MagaluConfig {
  username?: string;
  promoterId?: string;
}

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
    const magaluConfig = config as MagaluConfig;
    if (!magaluConfig) return null;

    try {
      const urlObj = new URL(url);

      if (url.includes('magazinevoce.com.br') && magaluConfig.username) {
        const pathMatch = urlObj.pathname.match(/^\/([^/]+)(\/.*)/);
        if (pathMatch) {
          urlObj.pathname = `/${magaluConfig.username}${pathMatch[2]}`;
          return urlObj.toString();
        }
      }

      if (url.includes('az-request-verify') && magaluConfig.promoterId) {
        const encodedUrl = urlObj.searchParams.get('url');
        if (encodedUrl) {
          let realUrl = decodeURIComponent(encodedUrl);
          realUrl = realUrl
            .replace(/promoter_id=\d+/g, `promoter_id=${magaluConfig.promoterId}`)
            .replace(/utm_campaign=\d+/g, `utm_campaign=${magaluConfig.promoterId}`);

          return realUrl;
        }
      }

      if (url.includes('magazineluiza.com.br') && magaluConfig.promoterId) {
        if (urlObj.searchParams.has('promoter_id')) {
          urlObj.searchParams.set('promoter_id', magaluConfig.promoterId);
          urlObj.searchParams.set('utm_campaign', magaluConfig.promoterId);
          urlObj.searchParams.set('c', magaluConfig.promoterId);

          const deepLinkValue = urlObj.searchParams.get('deep_link_value');
          if (deepLinkValue) {
            const decodedDeepLink = decodeURIComponent(deepLinkValue);
            const updatedDeepLink = decodedDeepLink
              .replace(/promoter_id=\d+/g, `promoter_id=${magaluConfig.promoterId}`)
              .replace(/utm_campaign=\d+/g, `utm_campaign=${magaluConfig.promoterId}`);
            urlObj.searchParams.set('deep_link_value', updatedDeepLink);
          }

          return urlObj.toString();
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

export const magaluProvider = new MagaluProvider();
