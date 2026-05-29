import type { CanonicalIdentifier } from '../types';

// Terabyte product URLs: /produto/<numeric-id>/<slug>
// The numeric id is stable; the slug varies across page updates and promotions.
const TERABYTE_PATTERN = /\/produto\/(\d+)/i;

const terabyteIdentifier: CanonicalIdentifier = {
  name: 'terabyte',
  canHandle(url: string): boolean {
    return url.toLowerCase().includes('terabyteshop.com.br');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    const match = pathname.match(TERABYTE_PATTERN);
    return match?.[1] ?? null;
  },
};

export default terabyteIdentifier;
