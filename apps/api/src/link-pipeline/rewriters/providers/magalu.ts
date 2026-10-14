import type { AffiliateRewriter } from '../types';
import type { MagaluConfig } from '~/link-pipeline/config';
import { logger } from '~/logger';

const MAGAZINEVOCE_DOMAIN = 'magazinevoce.com.br';
const MAGAZINELUIZA_DOMAIN = 'magazineluiza.com.br';
const AZ_REQUEST_VERIFY = 'az-request-verify';

export default class MagaluRewriter implements AffiliateRewriter {
  readonly name = 'magalu';

  constructor(private readonly cfg: MagaluConfig | null) {}

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes(MAGAZINELUIZA_DOMAIN)
      || lower.includes('magalu.')
      || lower.includes(MAGAZINEVOCE_DOMAIN);
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.cfg) return null;

    try {
      if (url.includes(MAGAZINEVOCE_DOMAIN) && this.cfg.username) {
        return this.rewriteMagazinevoce(url, this.cfg.username);
      }

      if (url.includes(AZ_REQUEST_VERIFY) && this.cfg.promoterId) {
        return this.rewriteAzRequestVerify(url, this.cfg.promoterId);
      }

      if (url.includes(MAGAZINELUIZA_DOMAIN) && this.cfg.promoterId) {
        return this.rewriteMagazineluiza(url, this.cfg.promoterId);
      }

      return null;
    } catch {
      logger.debug('Failed to rewrite Magalu link', { url });
      return null;
    }
  }

  private rewriteMagazinevoce(url: string, username: string): string | null {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/^\/([^/]+)(\/.*)/);
    if (!pathMatch) return null;

    urlObj.pathname = `/${username}${pathMatch[2]}`;
    const rewritten = urlObj.toString();
    logger.debug('Magalu (magazinevoce) link rewritten', { url: rewritten });
    return rewritten;
  }

  private rewriteAzRequestVerify(url: string, promoterId: string): string | null {
    const urlObj = new URL(url);
    const encodedUrl = urlObj.searchParams.get('url');
    if (!encodedUrl) return null;

    const realUrl = decodeURIComponent(encodedUrl)
      .replace(/promoter_id=\d+/g, `promoter_id=${promoterId}`)
      .replace(/utm_campaign=\d+/g, `utm_campaign=${promoterId}`);

    logger.debug('Magalu (az-request-verify) link rewritten', { url: realUrl });
    return realUrl;
  }

  private rewriteMagazineluiza(url: string, promoterId: string): string | null {
    const urlObj = new URL(url);
    if (!urlObj.searchParams.has('promoter_id')) return null;

    urlObj.searchParams.set('promoter_id', promoterId);
    urlObj.searchParams.set('utm_campaign', promoterId);
    urlObj.searchParams.set('c', promoterId);

    const deepLinkValue = urlObj.searchParams.get('deep_link_value');
    if (deepLinkValue) {
      const updated = decodeURIComponent(deepLinkValue)
        .replace(/promoter_id=\d+/g, `promoter_id=${promoterId}`)
        .replace(/utm_campaign=\d+/g, `utm_campaign=${promoterId}`);
      urlObj.searchParams.set('deep_link_value', updated);
    }

    const rewritten = urlObj.toString();
    logger.debug('Magalu (magazineluiza) link rewritten', { url: rewritten });
    return rewritten;
  }
}
