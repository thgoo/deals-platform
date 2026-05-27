import type { CanonicalIdentifier } from '../types';

// Either /p/MLB12345678 (catalog) or MLB-12345678 (legacy listing url).
const MLB_PATTERNS = [
  /\/p\/(MLB\d+)/i,
  /\/(MLB-?\d+)/i,
];

const mercadoLivreIdentifier: CanonicalIdentifier = {
  name: 'mercadolivre',
  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('mercadolivre.com.br') || lower.includes('mercadolibre.');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    for (const re of MLB_PATTERNS) {
      const match = pathname.match(re);
      const raw = match?.[1];
      if (raw) return raw.replace('-', '').toUpperCase();
    }
    return null;
  },
};

export default mercadoLivreIdentifier;
