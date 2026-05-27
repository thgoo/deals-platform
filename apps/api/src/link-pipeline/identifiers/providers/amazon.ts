import type { CanonicalIdentifier } from '../types';

const ASIN_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:\b|\/)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:\b|\/)/i,
];

const amazonIdentifier: CanonicalIdentifier = {
  name: 'amazon',
  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('amazon.com.br') || lower.includes('amzn.');
  },
  extract(url: string): string | null {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
    for (const re of ASIN_PATTERNS) {
      const match = pathname.match(re);
      if (match?.[1]) return match[1].toUpperCase();
    }
    return null;
  },
};

export default amazonIdentifier;
