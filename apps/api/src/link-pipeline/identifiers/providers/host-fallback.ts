import type { CanonicalIdentifier } from '../types';
import { AFFILIATE_NETWORK_DOMAINS, SHORTENER_DOMAINS } from '~/link-pipeline/resolvers/constants';

/**
 * Catch-all identifier for stores we haven't explicitly modeled.
 *
 * - `source` = hostname (e.g. `pichau.com.br`, `casasbahia.com.br`) — keeps each
 *   store's mappings in its own namespace so paths from different stores don't collide.
 * - `externalId` = lowercased pathname — unique per product slug. Variants that
 *   change the slug (color, spec) intentionally produce a different id; embedding
 *   match catches them on the next deal if they're actually the same product.
 *
 * Excludes URL shorteners and affiliate network endpoints — their paths are
 * opaque/tracking, not product-specific. The list of excluded hosts is the same
 * one used by the URL resolver.
 *
 * MUST be registered LAST so specific identifiers (Amazon, ML, Kabum, Pichau, ...)
 * claim their stores first and keep their compact `source` names.
 */
const EXCLUDED_HOST_FRAGMENTS = [...SHORTENER_DOMAINS, ...AFFILIATE_NETWORK_DOMAINS];

const hostFallbackIdentifier: CanonicalIdentifier = {
  name: 'host-fallback',
  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return !EXCLUDED_HOST_FRAGMENTS.some(fragment => lower.includes(fragment));
  },
  extract(url: string): { source: string; externalId: string } | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const externalId = parsed.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!externalId) return null;
    const source = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return { source, externalId };
  },
};

export default hostFallbackIdentifier;
