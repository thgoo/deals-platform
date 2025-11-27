import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../logger';

const AFFILIATE_NETWORK_DOMAINS = [
  'awin1.com',
  'awin.com',
  'go2cloud.org',
  'redirect.viglink.com',
];

/**
 * Expands shortened URLs by following redirects
 */
export async function expandUrl(shortUrl: string): Promise<string> {
  logger.debug(`Attempting to expand URL: ${shortUrl}`);
  try {
    logger.debug(`Making HTTP request to: ${shortUrl}`);
    const response = await axios.get(shortUrl, {
      maxRedirects: 10,
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        // eslint-disable-next-line @stylistic/max-len
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    let finalUrl = response.request.res?.responseUrl || response.config.url || shortUrl;
    logger.debug(`Initial response URL: ${finalUrl}, status: ${response.status}`);

    // If it went through an affiliate network, try to follow one more redirect
    logger.debug(`Checking if ${finalUrl} is an affiliate network URL`);
    if (isAffiliateNetworkUrl(finalUrl)) {
      const actualDestination = await followAffiliateNetwork(finalUrl);
      if (actualDestination) {
        finalUrl = actualDestination;
      }
    }

    // If redirect worked and changed URL
    if (finalUrl !== shortUrl && !finalUrl.includes('/ap/signin')) {
      logger.debug(`URL expanded successfully to: ${finalUrl}`);
      return finalUrl;
    }

    // Try to extract from HTML for known shorteners
    const contentType = response.headers['content-type'] || '';
    logger.debug(`Content-Type: ${contentType}`);
    if (contentType.includes('text/html') && response.data) {
      if (shortUrl.includes('tecno.click') || shortUrl.includes('tidd.ly')) {
        logger.debug(`Attempting to extract link from HTML for ${shortUrl}`);
        const extractedLink = extractLinkFromHtml(response.data, shortUrl);
        logger.debug(`Extracted link: ${extractedLink || 'null'}`);
        if (extractedLink && isValidProductLink(extractedLink)) {
          return extractedLink;
        }
      }
    }

    return finalUrl;
  } catch (error) {
    logger.error(`Failed to expand ${shortUrl}`, { error: error instanceof Error ? error.message : String(error) });
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
