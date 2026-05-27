import type { CanonicalIdentifier } from '../types';

// Kabum product URLs: /produto/<id>/<slug>
const KABUM_PATTERN = /\/produto\/(\d+)(?:\b|\/)/i;

const kabumIdentifier: CanonicalIdentifier = {
  name: 'kabum',
  canHandle(url: string): boolean {
    return url.toLowerCase().includes('kabum.com.br');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    const match = pathname.match(KABUM_PATTERN);
    return match?.[1] ?? null;
  },
};

export default kabumIdentifier;
