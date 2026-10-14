import * as cheerio from 'cheerio';
import type { AffiliateRewriter } from '../types';
import { logger } from '~/logger';

const ML_HEADERS: Record<string, string> = {
  // eslint-disable-next-line @stylistic/max-len
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
};

const ML_RESOLVE_TIMEOUT_MS = 15_000;

export default class MercadoLivreRewriter implements AffiliateRewriter {
  readonly name = 'mercadolivre';

  constructor(private readonly affiliateId: string | null) {}

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('mercadolivre.com.br') || lower.includes('mercadolibre.');
  }

  async rewrite(url: string): Promise<string | null> {
    try {
      const resolved = await this.resolveDestination(url);
      const urlObj = new URL(resolved);

      urlObj.hash = '';
      urlObj.search = '';
      if (this.affiliateId) urlObj.searchParams.set('pdp_source', this.affiliateId);

      const rewritten = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      logger.debug('Mercado Livre link rewritten', { url: rewritten });
      return rewritten;
    } catch {
      return null;
    }
  }

  /**
   * Mercado Livre's shortener ("sec/") returns an interstitial HTML page; the
   * real product URL must be scraped from it. For non-shortener URLs the
   * redirect chain already lands on the product page.
   */
  private async resolveDestination(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ML_RESOLVE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: ML_HEADERS,
        redirect: 'follow',
        signal: controller.signal,
      });

      const finalUrl = response.url || url;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return finalUrl;

      const html = await response.text();
      const extracted = extractMercadoLivreUrlFromHtml(html);
      return extracted || finalUrl;
    } catch {
      return url;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function extractMercadoLivreUrlFromHtml(html: string): string | null {
  try {
    const $ = cheerio.load(html);

    const goToProduct = $('a:contains("Ir para produto")').attr('href');
    if (goToProduct && isMercadoLivreUrl(goToProduct)) return goToProduct;

    const directMatch = html.match(/https:\/\/www\.mercadolivre\.com\.br\/[^"'\s]+\/p\/MLB\d+/i);
    if (directMatch?.[0]) return directMatch[0];

    const productLinks = $('a[href*="/p/MLB"]').toArray()
      .map(el => $(el).attr('href'))
      .filter((href): href is string => typeof href === 'string' && isMercadoLivreUrl(href));
    return productLinks.at(-1) ?? null;
  } catch {
    return null;
  }
}

function isMercadoLivreUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('mercadolivre.com.br');
  } catch {
    return false;
  }
}
