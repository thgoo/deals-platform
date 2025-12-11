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

      urlObj.searchParams.delete('tag');
      urlObj.searchParams.delete('linkCode');
      urlObj.searchParams.delete('ref_');

      urlObj.searchParams.set('tag', config);

      return urlObj.toString();
    } catch {
      return null;
    }
  }
}

export const amazonProvider = new AmazonProvider();
