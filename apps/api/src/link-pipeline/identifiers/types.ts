import type { UrlHandler } from '~/link-pipeline/utils/create-registry';

/**
 * Result of canonical id extraction.
 *
 * - Returning a `string` uses the identifier's own `name` field as the `source`
 *   (the common case for store-specific identifiers like Amazon, ML, Kabum).
 *
 * - Returning an object lets the identifier choose the `source` at runtime —
 *   used by the host fallback, which derives `source` from the URL's hostname.
 */
export type ExtractResult = string | { source: string; externalId: string };

/**
 * Extracts a store-specific canonical product identifier from a URL.
 * The identifier (ASIN, MLB number, etc.) is stable across user sessions
 * and tracking parameters, so it's the cheapest signal for catalog matching.
 *
 * Identifiers are stateless — no configuration, no I/O, just regex / parsing.
 */
export interface CanonicalIdentifier extends UrlHandler {
  /** Returns the canonical id or null when none can be extracted. */
  extract(url: string): ExtractResult | null;
}
