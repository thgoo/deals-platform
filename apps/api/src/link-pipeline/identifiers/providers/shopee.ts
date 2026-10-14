import type { CanonicalIdentifier } from '../types';

// Shopee URLs end in `-i.<shopId>.<itemId>` (current) or `/product/<shopId>/<itemId>` (legacy).
const SHOPEE_I_PATTERN = /-i\.(\d+)\.(\d+)/i;
const SHOPEE_PRODUCT_PATTERN = /\/product\/(\d+)\/(\d+)/i;

const shopeeIdentifier: CanonicalIdentifier = {
  name: 'shopee',
  canHandle(url: string): boolean {
    return url.toLowerCase().includes('shopee.com.br');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    for (const re of [SHOPEE_I_PATTERN, SHOPEE_PRODUCT_PATTERN]) {
      const match = pathname.match(re);
      if (match?.[1] && match?.[2]) return `${match[1]}.${match[2]}`;
    }
    return null;
  },
};

export default shopeeIdentifier;
