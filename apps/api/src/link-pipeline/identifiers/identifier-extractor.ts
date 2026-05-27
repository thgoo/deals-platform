import type { CanonicalIdentifier } from './types';
import type { ExternalId } from '~/link-pipeline/types';
import type { Registry } from '~/link-pipeline/utils/create-registry';

/**
 * Finds the first matching identifier and extracts the canonical ID from the URL.
 * Returns null when no identifier claims the URL or when extraction yields no id.
 *
 * Identifiers may return either a bare string (their `name` is used as source)
 * or a `{ source, externalId }` object (the host fallback uses this to set
 * `source` to the URL's hostname).
 */
export function extractExternalId(
  url: string,
  registry: Registry<CanonicalIdentifier>,
): ExternalId | null {
  const identifier = registry.findFor(url);
  if (!identifier) return null;

  const result = identifier.extract(url);
  if (!result) return null;

  if (typeof result === 'string') {
    return { source: identifier.name, externalId: result };
  }
  return result;
}

/**
 * Extracts canonical external ids from a list of URLs, deduplicated by source+id.
 * Useful when a deal carries several links that point to the same product (short + expanded form).
 */
export function extractExternalIds(
  urls: string[],
  registry: Registry<CanonicalIdentifier>,
): ExternalId[] {
  const seen = new Set<string>();
  const out: ExternalId[] = [];
  for (const url of urls) {
    const id = extractExternalId(url, registry);
    if (!id) continue;
    const key = `${id.source}:${id.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}
