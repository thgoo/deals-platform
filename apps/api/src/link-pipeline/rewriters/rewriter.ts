import type { AffiliateRewriter } from './types';
import type { Registry } from '~/link-pipeline/utils/create-registry';
import { cleanUrl } from '~/link-pipeline/utils/url-utils';
import { logger } from '~/logger';

export interface RewriteResult {
  /** The URL after rewriting (or after cleaning, when no rewriter applies). */
  final: string;
  /** Whether an affiliate provider produced the result (vs a generic clean). */
  rewritten: boolean;
}

/**
 * Selects the appropriate rewriter from the registry and applies it.
 * Falls back to a generic clean (strip query/hash) when no provider matches
 * or when the provider returns null.
 */
export async function rewriteLink(
  url: string,
  registry: Registry<AffiliateRewriter>,
): Promise<RewriteResult> {
  const provider = registry.findFor(url);

  if (!provider) {
    const cleaned = cleanUrl(url);
    logger.debug('No rewriter found, cleaned URL', { url: cleaned });
    return { final: cleaned, rewritten: false };
  }

  try {
    const rewritten = await provider.rewrite(url);
    if (rewritten) return { final: rewritten, rewritten: true };
  } catch (error) {
    logger.error('Rewriter threw an error', {
      provider: provider.name,
      url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const cleaned = cleanUrl(url);
  return { final: cleaned, rewritten: false };
}
