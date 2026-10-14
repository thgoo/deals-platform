import type { AffiliateRewriter } from '../types';
import { logger } from '~/logger';

const ASIN_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:\b|\/)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:\b|\/)/i,
];

export default class AmazonRewriter implements AffiliateRewriter {
  readonly name = 'amazon';

  constructor(private readonly affiliateTag: string | null) {}

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('amazon.com.br') || lower.includes('amzn.');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.affiliateTag) return null;

    try {
      const urlObj = new URL(url);

      const asin = extractAsin(urlObj.pathname);
      if (asin) urlObj.pathname = `/dp/${asin}/ref=nosim`;

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

function extractAsin(pathname: string): string | null {
  for (const re of ASIN_PATTERNS) {
    const asin = pathname.match(re)?.[1];
    if (asin) return asin.toUpperCase();
  }
  return null;
}
