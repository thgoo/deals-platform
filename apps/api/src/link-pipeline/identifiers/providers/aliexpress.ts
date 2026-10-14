import type { CanonicalIdentifier } from '../types';

// AliExpress product URLs: /item/<id>.html
const ALIEXPRESS_PATTERN = /\/item\/(\d+)\.html/i;

const aliExpressIdentifier: CanonicalIdentifier = {
  name: 'aliexpress',
  canHandle(url: string): boolean {
    return url.toLowerCase().includes('aliexpress.com');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    const match = pathname.match(ALIEXPRESS_PATTERN);
    return match?.[1] ?? null;
  },
};

export default aliExpressIdentifier;
