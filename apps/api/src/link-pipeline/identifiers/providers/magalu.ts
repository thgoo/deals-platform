import type { CanonicalIdentifier } from '../types';

// Magalu product URLs typically follow /produto-name/p/<product-code>/<category-tree>
const MAGALU_PATTERN = /\/p\/([a-z0-9]+)(?:\b|\/)/i;

const magaluIdentifier: CanonicalIdentifier = {
  name: 'magalu',
  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('magazineluiza.com.br') || lower.includes('magazinevoce.com.br');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    const match = pathname.match(MAGALU_PATTERN);
    return match?.[1] ?? null;
  },
};

export default magaluIdentifier;
