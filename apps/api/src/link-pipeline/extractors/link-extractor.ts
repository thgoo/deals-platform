const LINK_REGEX = /https?:\/\/\S+/gi;

/**
 * Extracts URLs from raw text and merges them with URLs already known
 * (e.g. URLs parsed by Telegram's MessageEntity layer). Order is preserved
 * and duplicates are removed.
 */
export function extractLinks(text: string, knownLinks: string[] = []): string[] {
  const collected: string[] = [];

  const fromText = text.match(LINK_REGEX);
  if (fromText) collected.push(...fromText);
  collected.push(...knownLinks);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of collected) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
