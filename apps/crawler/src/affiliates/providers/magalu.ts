import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

class MagaluProvider implements AffiliateProvider {
  readonly name = 'magalu';
  private username: string | null = null;
  private promoterId: string | null = null;

  configure(config: AffiliateConfig): void {
    this.username = config.magalu?.username ?? null;
    this.promoterId = config.magalu?.promoterId ?? null;
  }

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    const knownDomains = [
      'magazineluiza.com.br',
      'magalu.',
      'magazinevoce.com.br',
    ];
    return knownDomains.some(domain => urlLower.includes(domain));
  }

  async rewrite(url: string): Promise<string | null> {
    try {
      const urlObj = new URL(url);

      if (url.includes('magazinevoce.com.br') && this.username) {
        const pathMatch = urlObj.pathname.match(/^\/([^/]+)(\/.*)/);
        if (pathMatch) {
          urlObj.pathname = `/${this.username}${pathMatch[2]}`;
          const rewritten = urlObj.toString();
          logger.debug('Magalu (magazinevoce) link rewritten', { url: rewritten });
          return rewritten;
        }
      }

      if (url.includes('az-request-verify') && this.promoterId) {
        const encodedUrl = urlObj.searchParams.get('url');
        if (encodedUrl) {
          let realUrl = decodeURIComponent(encodedUrl);
          realUrl = realUrl
            .replace(/promoter_id=\d+/g, `promoter_id=${this.promoterId}`)
            .replace(/utm_campaign=\d+/g, `utm_campaign=${this.promoterId}`);

          logger.debug('Magalu (az-request-verify) link rewritten', { url: realUrl });
          return realUrl;
        }
      }

      if (url.includes('magazineluiza.com.br') && this.promoterId) {
        if (urlObj.searchParams.has('promoter_id')) {
          urlObj.searchParams.set('promoter_id', this.promoterId);
          urlObj.searchParams.set('utm_campaign', this.promoterId);
          urlObj.searchParams.set('c', this.promoterId);

          const deepLinkValue = urlObj.searchParams.get('deep_link_value');
          if (deepLinkValue) {
            const decodedDeepLink = decodeURIComponent(deepLinkValue);
            const updatedDeepLink = decodedDeepLink
              .replace(/promoter_id=\d+/g, `promoter_id=${this.promoterId}`)
              .replace(/utm_campaign=\d+/g, `utm_campaign=${this.promoterId}`);
            urlObj.searchParams.set('deep_link_value', updatedDeepLink);
          }

          const rewritten = urlObj.toString();
          logger.debug('Magalu (magazineluiza) link rewritten', { url: rewritten });
          return rewritten;
        }
      }

      return null;
    } catch {
      logger.debug('Failed to rewrite Magalu link', { url });
      return null;
    }
  }
}

export const magaluProvider = new MagaluProvider();
