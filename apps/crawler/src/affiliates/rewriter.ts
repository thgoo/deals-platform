import type { AffiliateConfig } from '../config';
import { logger } from '../logger';
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

    // Expand shortened links
    if (isShortened) {
      finalUrl = await expandUrl(url);
    }

    // Find provider that can handle this URL
    const provider = providerRegistry.findProvider(finalUrl);

    if (!provider) {
      logger.debug(`No provider found for URL: ${finalUrl}`);
      return url;
    }

    // Get config for this provider
    const providerConfig = config[provider.name as keyof AffiliateConfig];

    // Rewrite using provider
    const rewritten = await provider.rewrite(finalUrl, providerConfig);

    return rewritten ?? url;
  } catch (error) {
    logger.error(`Error rewriting link ${url}`, { error });
    return url;
  }
}
