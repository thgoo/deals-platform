/**
 * Base interface for affiliate providers
 * Each provider is responsible for:
 * - Detecting if it can handle a URL
 * - Rewriting the URL with affiliate parameters
 *
 * Providers can use any strategy internally (API calls, URL manipulation, etc)
 */
export interface AffiliateProvider {
  /**
   * Provider name (e.g., 'amazon', 'shopee')
   */
  readonly name: string;

  /**
   * Check if this provider can handle the given URL
   */
  canHandle(url: string): boolean;

  /**
   * Rewrite the URL with affiliate parameters
   *
   * @param url - The URL to rewrite
   * @param config - Configuration (can be string, object, etc - provider decides)
   * @returns Rewritten URL or null if failed/not configured
   */
  rewrite(url: string, config: unknown): Promise<string | null>;
}
