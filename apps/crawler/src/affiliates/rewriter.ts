import type { AffiliateConfig } from '../config';
import { logger } from '../logger';
import { cleanUrl } from '../processing/utils';
import { initializeProviders, providerRegistry } from './providers';
import { expandUrl } from './url-expander';

const SHORTENER_DOMAINS = [
  'amzn.to',
  'amzn.divulgador.link',
  's.shopee.com.br',
  'mercadolivre.com/sec',
  's.click.aliexpress.com',
  'tidd.ly',
  'tiddly.xyz',
  'magalu.divulgador.link',
  'natura.divulgador.link',
  'tecno.click',
  'curt.link',
  'cutt.ly',
];

let providersInitialized = false;

/**
 * Rewrites a list of links by replacing affiliate IDs
 */
export async function rewriteLinks(
  links: string[],
  config: AffiliateConfig,
): Promise<string[]> {
  // Initialize providers on first call
  if (!providersInitialized) {
    initializeProviders(config);
    providersInitialized = true;
  }

  const results = await Promise.all(
    links.map(link => rewriteSingleLink(link, config)),
  );

  return results;
}

async function rewriteSingleLink(
  url: string,
  config: AffiliateConfig,
): Promise<string> {
  try {
    // Detect if it's a shortener
    const isShortened = SHORTENER_DOMAINS.some(domain => url.includes(domain));

    let finalUrl = url;

    // Always try to expand if it's a shortener
    if (isShortened) {
      finalUrl = await expandUrl(url);
      logger.debug(`Expanded ${url} to ${finalUrl}`);
    }

    // Find provider that can handle this URL
    const provider = providerRegistry.findProvider(finalUrl);

    if (!provider) {
      logger.debug(`No provider found for URL: ${finalUrl}`);
      // If no provider, return expanded URL without query params
      const cleanedUrl = cleanUrl(finalUrl);
      logger.debug(`Cleaned URL (no provider): ${cleanedUrl}`);
      return cleanedUrl;
    }

    // Get config for this provider
    const providerConfig = config[provider.name as keyof AffiliateConfig];

    // Rewrite using provider
    const rewritten = await provider.rewrite(finalUrl, providerConfig);

    // Always return the expanded/rewritten URL, not the original
    return rewritten ?? finalUrl;
  } catch (error) {
    logger.error(`Error rewriting link ${url}`, { error });
    return url;
  }
}
