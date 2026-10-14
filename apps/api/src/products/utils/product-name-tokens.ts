/**
 * Token overlap between two product names — used to decide whether a deal
 * actually refers to the product it is linked to.
 *
 * The signal: two names for the SAME product share their distinctive tokens
 * (brand, line, type — "ninja", "leap", "teclado"). A garbage-magnet match
 * ("SSD Kingston" linked to "Teclado Ninja Leap") shares ZERO distinctive
 * tokens. Generic descriptors (gamer, rgb, usb, colors, ...) are stripped so
 * they don't create phantom overlap between unrelated products.
 */

// Grammatical stopwords (pt-BR + en) plus generic product descriptors that
// appear across many unrelated products and carry no identifying signal.
const NOISE_TOKENS = new Set([
  // grammatical
  'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'em', 'por', 'no', 'na',
  'nos', 'nas', 'ao', 'aos', 'ou', 'que', 'sem', 'sob', 'sobre', 'ate',
  'apos', 'um', 'uma', 'uns', 'umas', 'the', 'and', 'for', 'of',
  // generic descriptors
  'gamer', 'gaming', 'rgb', 'argb', 'usb', 'bluetooth', 'wireless', 'fio',
  'wifi', 'led', 'original', 'kit', 'combo', 'novo', 'nova', 'pro', 'plus',
  'max', 'ultra', 'edition', 'edicao', 'unidades', 'unidade', 'pcs', 'pecas',
  // colors (kept out of overlap — used only as variant signal elsewhere)
  'preto', 'preta', 'branco', 'branca', 'cinza', 'azul', 'vermelho', 'verde',
  'rosa', 'black', 'white', 'grey', 'gray', 'blue', 'red', 'green', 'pink',
]);

export function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !NOISE_TOKENS.has(t)),
  );
}

/** Number of distinctive tokens shared between two product names. */
export function sharedTokenCount(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  let shared = 0;
  for (const t of ta) {
    if (tb.has(t)) shared++;
  }
  return shared;
}
