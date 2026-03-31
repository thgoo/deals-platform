import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../logger';
import { AFFILIATE_NETWORK_DOMAINS, HTTP_HEADERS, PROMOZONE_RESOLVE_API, SHORTENER_DOMAINS } from './constants';

async function expandPromozoneUrl(shortUrl: string): Promise<string> {
  try {
    const shortCode = new URL(shortUrl).pathname.split('/').filter(Boolean).pop();
    if (!shortCode) return shortUrl;

    const response = await axios.get(`${PROMOZONE_RESOLVE_API}/${encodeURIComponent(shortCode)}`, {
      headers: { Accept: 'application/json' },
      timeout: 5000,
    });

    const destinationUrl = response.data?.destinationUrl;
    if (destinationUrl && typeof destinationUrl === 'string') {
      logger.debug('Promozone URL resolved', { from: shortUrl, to: destinationUrl });
      return destinationUrl;
    }
  } catch (error) {
    logger.error('Failed to resolve Promozone URL', {
      url: shortUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return shortUrl;
}

export async function expandUrl(shortUrl: string): Promise<string> {
  if (shortUrl.includes('go.promozone.ai')) {
    const resolved = await expandPromozoneUrl(shortUrl);
    const needsExpansion = SHORTENER_DOMAINS.some(domain => resolved.includes(domain));
    return needsExpansion ? expandUrl(resolved) : resolved;
  }

  try {
    const response = await axios.get(shortUrl, {
      maxRedirects: 10,
      timeout: 10000,
      validateStatus: () => true,
      headers: HTTP_HEADERS,
    });

    let finalUrl = response.request.res?.responseUrl || response.config.url || shortUrl;

    // ShieldSquare/Radware bot protection intercepts requests and redirects to
    // validate.perfdrive.com — the actual destination is in the `ssc` param
    if (finalUrl.includes('validate.perfdrive.com')) {
      const perfdriveUrl = new URL(finalUrl);
      const ssc = perfdriveUrl.searchParams.get('ssc');
      if (ssc) {
        finalUrl = decodeURIComponent(ssc);
        logger.debug('Bypassed perfdrive bot protection', { from: shortUrl, to: finalUrl });
      }
    }

    if (isAffiliateNetworkUrl(finalUrl)) {
      const actualDestination = await followAffiliateNetwork(finalUrl);
      if (actualDestination) {
        finalUrl = actualDestination;
      }
    }

    if (finalUrl !== shortUrl && !finalUrl.includes('/ap/signin')) {
      logger.debug('URL expanded', { from: shortUrl, to: finalUrl });
      return finalUrl;
    }

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html') && response.data) {
      if (shortUrl.includes('tecno.click') || shortUrl.includes('tidd.ly')) {
        const extractedLink = extractLinkFromHtml(response.data, shortUrl);
        if (extractedLink && isValidProductLink(extractedLink)) {
          logger.debug('URL extracted from HTML', { from: shortUrl, to: extractedLink });
          return extractedLink;
        }
      }
    }

    return finalUrl;
  } catch (error) {
    logger.error('Failed to expand URL',
      {
        url: shortUrl,
        error: error instanceof Error ? error.message : String(error),
      },
    );
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
      headers: HTTP_HEADERS,
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
