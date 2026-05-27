/**
 * Patterns of irrelevant links that must be dropped before any processing.
 * These are channel self-promotion, Telegram navigation, and Mercado Livre's
 * "social" links (which lead to the seller's profile, not a product).
 */
const IRRELEVANT_PATTERNS = [
  't.me/',
  'bit.ly/canal',
  'adrena.click/ofertas',
  'linkmc.click/ofertas',
  'mercadolivre.com.br/social/',
];

export function filterRelevantLinks(links: string[]): string[] {
  if (links.length === 0) return [];

  return links.filter(link => {
    const lower = link.toLowerCase();
    return !IRRELEVANT_PATTERNS.some(pattern => lower.includes(pattern));
  });
}
