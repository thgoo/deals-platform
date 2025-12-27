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
  'divulgador.magalu.com',
  'eusoubarone.link',
];

let providersInitialized = false;

/**
 * Rewrites a list of links by replacing affiliate IDs
 */
export async function rewriteLinks(
  links: string[],
  config: AffiliateConfig,
): Promise<string[]> {
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
    const isShortened = SHORTENER_DOMAINS.some(domain => url.includes(domain));

    let finalUrl = url;

    if (isShortened) {
      finalUrl = await expandUrl(url);
      logger.debug(`Expanded ${url} to ${finalUrl}`);
    }

    const provider = providerRegistry.findProvider(finalUrl);

    if (!provider) {
      logger.debug(`No provider found for URL: ${finalUrl}`);
      const cleanedUrl = cleanUrl(finalUrl);
      logger.debug(`Cleaned URL (no provider): ${cleanedUrl}`);
      return cleanedUrl;
    }

    const providerConfig = config[provider.name as keyof AffiliateConfig];

    const rewritten = await provider.rewrite(finalUrl, providerConfig);

    return rewritten ?? finalUrl;
  } catch (error) {
    logger.error(`Error rewriting link ${url}`, { error });
    return url;
  }
}
