import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

class AmazonProvider implements AffiliateProvider {
  readonly name = 'amazon';
  private affiliateTag: string | null = null;

  configure(config: AffiliateConfig): void {
    this.affiliateTag = config.amazon ?? null;
  }

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('amazon.com.br') || urlLower.includes('amzn.');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.affiliateTag) return null;

    try {
      const urlObj = new URL(url);

      const asin = extractAmazonAsin(urlObj.pathname);
      if (asin) {
        urlObj.pathname = `/dp/${asin}/ref=nosim`;
      }

      urlObj.hash = '';
      urlObj.search = '';
      urlObj.searchParams.set('tag', this.affiliateTag);

      const rewritten = urlObj.toString();
      logger.debug('Amazon link rewritten', { asin: asin ?? 'unknown', url: rewritten });
      return rewritten;
    } catch {
      logger.debug('Failed to rewrite Amazon link', { url });
      return null;
    }
  }
}

function extractAmazonAsin(pathname: string): string | null {
  const candidates = [
    /\/dp\/([A-Z0-9]{10})(?:\b|\/)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:\b|\/)/i,
  ];

  for (const re of candidates) {
    const match = pathname.match(re);
    const asin = match?.[1];
    if (asin) return asin.toUpperCase();
  }

  return null;
}

export const amazonProvider = new AmazonProvider();
