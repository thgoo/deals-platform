import type { CanonicalIdentifier } from '../types';

/**
 * Pichau's product URLs follow `/<product-slug>-<sku>` with no standalone numeric
 * id we can isolate cleanly across categories. Use the full pathname as the
 * canonical identifier — stable across query params (UTM, affiliate) and unique
 * per product (color/spec variants get their own slug, which is what we want).
 */
const pichauIdentifier: CanonicalIdentifier = {
  name: 'pichau',
  canHandle(url: string): boolean {
    return url.toLowerCase().includes('pichau.com.br');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    const slug = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    return slug || null;
  },
};

export default pichauIdentifier;
