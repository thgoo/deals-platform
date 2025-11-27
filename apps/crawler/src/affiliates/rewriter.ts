import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AffiliateConfig } from '../config';
import { logger } from '../logger';
import { initializeProviders, providerRegistry } from './providers';

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

const AFFILIATE_NETWORK_DOMAINS = [
  'awin1.com',
  'awin.com',
  'go2cloud.org',
  'redirect.viglink.com',
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

async function expandUrl(shortUrl: string): Promise<string> {
  try {
    const response = await axios.get(shortUrl, {
      maxRedirects: 10,
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        // eslint-disable-next-line @stylistic/max-len
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    let finalUrl = response.request.res?.responseUrl || response.config.url || shortUrl;

    // If it went through an affiliate network, try to follow one more redirect
    if (isAffiliateNetworkUrl(finalUrl)) {
      const actualDestination = await followAffiliateNetwork(finalUrl);
      if (actualDestination) {
        finalUrl = actualDestination;
      }
    }

    // If redirect worked and changed URL
    if (finalUrl !== shortUrl && !finalUrl.includes('/ap/signin')) {
      return finalUrl;
    }

    // Try to extract from HTML for known shorteners
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html') && response.data) {
      if (shortUrl.includes('tecno.click') || shortUrl.includes('tidd.ly')) {
        const extractedLink = extractLinkFromHtml(response.data, shortUrl);
        if (extractedLink && isValidProductLink(extractedLink)) {
          return extractedLink;
        }
      }
    }

    return finalUrl;
  } catch {
    logger.error(`Failed to expand ${shortUrl}`);
    return shortUrl;
  }
}

function isAffiliateNetworkUrl(url: string): boolean {
  return AFFILIATE_NETWORK_DOMAINS.some(domain => url.includes(domain));
}

async function followAffiliateNetwork(networkUrl: string): Promise<string | null> {
  try {
    const urlObj = new URL(networkUrl);

    if (networkUrl.includes('awin')) {
      const ued = urlObj.searchParams.get('ued');
      if (ued) {
        return decodeURIComponent(ued);
      }
    }

    const response = await axios.get(networkUrl, {
      maxRedirects: 5,
      timeout: 5000,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const finalUrl = response.request.res?.responseUrl || response.config.url;
    return finalUrl !== networkUrl ? finalUrl : null;
  } catch {
    return null;
  }
}

function isValidProductLink(url: string): boolean {
  try {
    const urlObj = new URL(url);

    if (url.includes('/ap/signin') || url.includes('/login') || url.includes('/auth')) {
      return false;
    }

    const validDomains = [
      'amazon.com.br',
      'shopee.com.br',
      'mercadolivre.com.br',
      'aliexpress.com',
      'magazineluiza.com.br',
      'natura.com.br',
    ];

    return validDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

function extractLinkFromHtml(html: string, originalUrl: string): string | null {
  try {
    const $ = cheerio.load(html);

    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=(.+)/i);
      if (match) return match[1]?.trim() || null;
    }

    const clickHereLink = $('a:contains("clique aqui")').attr('href');
    if (clickHereLink) return clickHereLink;

    const domain = new URL(originalUrl).hostname;
    const links = $('a[href^="http"]');

    for (const link of links) {
      const href = $(link).attr('href');
      if (href && !href.includes(domain)) {
        return href;
      }
    }

    return null;
  } catch {
    return null;
  }
}
