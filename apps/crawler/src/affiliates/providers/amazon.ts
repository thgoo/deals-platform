import type { AffiliateProvider } from './base';

class AmazonProvider implements AffiliateProvider {
  readonly name = 'amazon';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('amazon.com.br') || urlLower.includes('amzn.');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    if (typeof config !== 'string' || !config) return null;

    try {
      const urlObj = new URL(url);

      const asin = extractAmazonAsin(urlObj.pathname);
      if (asin) {
        urlObj.pathname = `/dp/${asin}/ref=nosim`;
      }

      urlObj.hash = '';
      urlObj.search = '';
      urlObj.searchParams.set('tag', config);

      return urlObj.toString();
    } catch {
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
