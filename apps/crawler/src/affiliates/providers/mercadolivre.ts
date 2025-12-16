import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AffiliateProvider } from './base';

const HEADERS = {
  // eslint-disable-next-line @stylistic/max-len
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
};

class MercadoLivreProvider implements AffiliateProvider {
  readonly name = 'mercadolivre';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('mercadolivre.com.br') || urlLower.includes('mercadolibre.');
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    try {
      const resolved = await resolveMercadoLivreDestination(url);

      const urlObj = new URL(resolved);
      urlObj.hash = '';
      urlObj.search = '';

      if (typeof config === 'string' && config) {
        urlObj.searchParams.set('pdp_source', config);
      }

      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch {
      return null;
    }
  }
}

async function resolveMercadoLivreDestination(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      maxRedirects: 10,
      timeout: 15000,
      validateStatus: () => true,
      headers: HEADERS,
    });

    const responseUrl: string | undefined =
      response.request?.res?.responseUrl || response.config?.url;

    const finalUrl = responseUrl || url;

    const contentType = String(response.headers?.['content-type'] || '');
    if (!contentType.includes('text/html') || !response.data) {
      return finalUrl;
    }

    const html = String(response.data);
    const extracted = extractMercadoLivreUrlFromHtml(html);

    return extracted || finalUrl;
  } catch {
    return url;
  }
}

function extractMercadoLivreUrlFromHtml(html: string): string | null {
  try {
    const $ = cheerio.load(html);

    const goToProduct = $('a:contains("Ir para produto")').attr('href');
    if (goToProduct && isMercadoLivreUrl(goToProduct)) return goToProduct;

    const match = html.match(/https:\/\/www\.mercadolivre\.com\.br\/[^"'\s]+\/p\/MLB\d+/i);
    if (match?.[0]) return match[0];

    const productLinks = $('a[href*="/p/MLB"]').toArray()
      .map(el => $(el).attr('href'))
      .filter(href => href && isMercadoLivreUrl(href));
    const last = productLinks.at(-1);
    if (last) return last;

    return null;
  } catch {
    return null;
  }
}

function isMercadoLivreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('mercadolivre.com.br');
  } catch {
    return false;
  }
}

export const mercadoLivreProvider = new MercadoLivreProvider();
