import type { AffiliateConfig } from '../config';
import { logger } from '../logger';
import { cleanUrl } from '../processing/utils';
import { initializeProviders, providerRegistry } from './providers';
import { expandUrl } from './url-expander';

export interface RewriteResult {
  original: string;
  expanded?: string;
  final: string;
  allVersions: string[];
}

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
 * Rewrites links and returns structured results with all versions.
 * Each result contains original, expanded (if applicable), final, and allVersions array.
 */
export async function rewriteLinks(
  links: string[],
  config: AffiliateConfig,
): Promise<RewriteResult[]> {
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
): Promise<RewriteResult> {
  try {
    const originalUrl = url;
    const allVersions: string[] = [originalUrl];

    const isShortened = SHORTENER_DOMAINS.some(domain => url.includes(domain));

    let expandedUrl: string | undefined;

    if (isShortened) {
      const expanded = await expandUrl(url);
      logger.debug(`Expanded ${url} to ${expanded}`);
      if (expanded !== originalUrl) {
        expandedUrl = expanded;
        allVersions.push(expandedUrl);
      }
    }

    const urlToProcess = expandedUrl ?? originalUrl;
    const provider = providerRegistry.findProvider(urlToProcess);

    if (!provider) {
      logger.debug(`No provider found for URL: ${urlToProcess}`);
      const cleanedUrl = cleanUrl(urlToProcess);
      logger.debug(`Cleaned URL (no provider): ${cleanedUrl}`);

      const finalUrl = cleanedUrl !== urlToProcess ? cleanedUrl : urlToProcess;
      if (finalUrl !== urlToProcess && finalUrl !== originalUrl) {
        allVersions.push(finalUrl);
      }

      return { original: originalUrl, expanded: expandedUrl, final: finalUrl, allVersions };
    }

    const providerConfig = config[provider.name as keyof AffiliateConfig];
    const rewritten = await provider.rewrite(urlToProcess, providerConfig);
    const finalUrl = rewritten ?? urlToProcess;

    if (finalUrl !== urlToProcess && finalUrl !== originalUrl) {
      allVersions.push(finalUrl);
    }

    return { original: originalUrl, expanded: expandedUrl, final: finalUrl, allVersions };
  } catch (error) {
    logger.error(`Error rewriting link ${url}`, { error });
    return { original: url, final: url, allVersions: [url] };
  }
}
