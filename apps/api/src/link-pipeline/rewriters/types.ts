import type { UrlHandler } from '~/link-pipeline/utils/create-registry';

/**
 * A rewriter knows how to turn a destination URL for a specific store
 * into an affiliate-tagged URL that pays our publisher account when clicked.
 *
 * Rewriters are stateless once constructed: their affiliate credentials are
 * passed at construction time, not via a separate configure() step.
 */
export interface AffiliateRewriter extends UrlHandler {
  /**
   * Rewrites the URL with affiliate parameters.
   * Returns null when this rewriter cannot produce an affiliate URL
   * (e.g. credentials missing, URL shape unrecognized, upstream API failed).
   */
  rewrite(url: string): Promise<string | null>;
}
