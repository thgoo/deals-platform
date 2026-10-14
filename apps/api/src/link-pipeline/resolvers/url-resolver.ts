import * as cheerio from 'cheerio';
import { logger } from '~/logger';
import { HTTP_HEADERS, REQUEST_TIMEOUT_MS, SHORTENER_DOMAINS } from './constants';
import { followAffiliateNetwork, isAffiliateNetworkUrl } from './network-follower';
import { resolvePromozoneUrl } from './promozone';

const BOT_PROTECTION_HOST = 'validate.perfdrive.com';
const SIGNIN_PATH = '/ap/signin';

const STORE_DOMAINS = [
  'amazon.com.br',
  'shopee.com.br',
  'mercadolivre.com.br',
  'aliexpress.com',
  'magazineluiza.com.br',
  'natura.com.br',
];

/**
 * Resolves a (possibly shortened) URL to its real destination.
 *
 * Strategy:
 *  - Promozone (`go.promozone.ai`): use the dedicated resolve API, then recurse if the result is another shortener.
 *  - Magalu "divulgador" links: stop at the first redirect — following all of them lands on a login wall.
 *  - Generic shorteners: follow the full redirect chain.
 *  - Refresh header fallback: some shorteners (e.g. tecno.click) use non-standard HTTP `Refresh`.
 *  - ShieldSquare guard: if the chain ends on a bot-protection wall, return the original URL.
 *  - Affiliate network unwrap: if the destination is an Awin-style network URL, dig out the real target.
 *  - HTML fallback: for stubborn shorteners (tecno.click, tidd.ly), parse the HTML and extract the product link.
 *
 * On any failure, returns the input URL unchanged.
 */
export async function expandUrl(shortUrl: string): Promise<string> {
  if (shortUrl.includes('go.promozone.ai')) {
    const resolved = await resolvePromozoneUrl(shortUrl);
    const needsExpansion = SHORTENER_DOMAINS.some(domain => resolved.includes(domain));
    return needsExpansion ? expandUrl(resolved) : resolved;
  }

  const isMagaluDivulgador
    = shortUrl.includes('divulgador.magalu.com') || shortUrl.includes('magalu.divulgador.link');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(shortUrl, {
      method: 'GET',
      headers: HTTP_HEADERS,
      redirect: isMagaluDivulgador ? 'manual' : 'follow',
      signal: controller.signal,
    });

    if (isMagaluDivulgador) {
      const location = response.headers.get('location');
      if (location && response.status >= 300 && response.status < 400) {
        logger.debug('Magalu divulgador resolved via first redirect', { from: shortUrl, to: location });
        return location;
      }
    }

    let finalUrl = response.url || shortUrl;

    const refresh = response.headers.get('refresh');
    if (refresh) {
      const match = refresh.match(/URL=(.+)/i);
      if (match?.[1]) {
        finalUrl = match[1].trim();
        logger.debug('URL resolved via refresh header', { from: shortUrl, to: finalUrl });
      }
    }

    if (finalUrl.includes(BOT_PROTECTION_HOST)) {
      logger.debug('Bot protection detected; keeping original short URL', {
        from: shortUrl,
        blocked: finalUrl,
      });
      return shortUrl;
    }

    if (isAffiliateNetworkUrl(finalUrl)) {
      const realDestination = await followAffiliateNetwork(finalUrl);
      if (realDestination) finalUrl = realDestination;
    }

    if (finalUrl !== shortUrl && !finalUrl.includes(SIGNIN_PATH)) {
      logger.debug('URL expanded', { from: shortUrl, to: finalUrl });
      return finalUrl;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      const needsHtmlFallback = shortUrl.includes('tecno.click') || shortUrl.includes('tidd.ly');
      if (needsHtmlFallback) {
        const html = await response.text();
        const extracted = extractLinkFromHtml(html, shortUrl);
        if (extracted && isValidProductLink(extracted)) {
          logger.debug('URL extracted from HTML', { from: shortUrl, to: extracted });
          return extracted;
        }
      }
    }

    return finalUrl;
  } catch (error) {
    logger.error('Failed to expand URL', {
      url: shortUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return shortUrl;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isValidProductLink(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (url.includes(SIGNIN_PATH) || url.includes('/login') || url.includes('/auth')) {
    return false;
  }
  return STORE_DOMAINS.some(domain => parsed.hostname.includes(domain));
}

function extractLinkFromHtml(html: string, originalUrl: string): string | null {
  try {
    const $ = cheerio.load(html);

    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=(.+)/i);
      if (match?.[1]) return match[1].trim();
    }

    const clickHereLink = $('a:contains("clique aqui")').attr('href');
    if (clickHereLink) return clickHereLink;

    const originDomain = new URL(originalUrl).hostname;
    const externalLink = $('a[href^="http"]').toArray()
      .map(el => $(el).attr('href'))
      .find(href => typeof href === 'string' && !href.includes(originDomain));
    return externalLink ?? null;
  } catch {
    return null;
  }
}
