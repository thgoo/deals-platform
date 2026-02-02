import type { AffiliateConfig } from '../config';
import type { TelegramIncomingMessage } from '../telegram';
import { rewriteLinks } from '../affiliates/rewriter';
import { logger } from '../logger';

const LINK_REGEX = /https?:\/\/\S+/gi;

class LinkProcessor {
  extractLinks(message: TelegramIncomingMessage): string[] {
    const links: string[] = [];
    const text = message.text || '';

    const textLinks = text.match(LINK_REGEX);
    if (textLinks) links.push(...textLinks);

    if (message.links && message.links.length > 0) {
      links.push(...message.links);
    }

    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of links) {
      if (!seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }

    return out;
  }

  filterRelevantLinks(links: string[]): string[] {
    if (!links || links.length === 0) return [];

    return links.filter(link => {
      if (link.includes('t.me/')) return false;

      if (link.includes('bit.ly/canal') ||
          link.includes('adrena.click/ofertas') ||
          link.includes('linkmc.click/ofertas')) return false;

      if (link.includes('mercadolivre.com.br/social/')) return false;

      if (link.includes('amazon.com.br/dp/') ||
          link.includes('mercadolivre.com.br/p/MLB')) return true;

      if (link.includes('shopee.com.br') && link.includes('/product/')) return true;

      if (link.includes('aliexpress.com/item/')) return true;

      if (link.includes('mercadolivre.com.br/cupons') ||
          link.includes('amazon.com.br/promotion')) return true;

      if (link.includes('curt.link/') ||
          link.includes('tidd.ly/') ||
          link.includes('mercadolivre.com/sec/')) return true;

      if (link.includes('natura.divulgador.link/')) return true;

      return true;
    });
  }

  async processLinks(
    message: TelegramIncomingMessage,
    affiliateConfig: AffiliateConfig,
  ): Promise<{ final: string[], allVersions: string[] }> {
    const extractedLinks = this.extractLinks(message);
    if (extractedLinks.length === 0) {
      return { final: [], allVersions: [] };
    }

    const filteredLinks = this.filterRelevantLinks(extractedLinks);
    if (filteredLinks.length === 0) {
      return { final: [], allVersions: [] };
    }

    logger.info(`Processing ${filteredLinks.length} links from message #${message.id} (with history for extractor)`);

    const results = await rewriteLinks(filteredLinks, affiliateConfig);

    const finalLinks = results.map(r => r.final);
    const allVersions = results.flatMap(r => r.allVersions);

    return { final: finalLinks, allVersions };
  }

  generateCouponFallbackLinks(store: string | null, affiliateConfig: AffiliateConfig): string[] {
    const fallbackLinks: string[] = [];

    if (!store) return fallbackLinks;

    const storeLower = store.toLowerCase();

    if (storeLower.includes('mercado') || storeLower.includes('mercadolivre')) {
      const mlAffiliateId = affiliateConfig.mercadolivre;
      if (mlAffiliateId) {
        fallbackLinks.push(`https://www.mercadolivre.com.br/cupons?pdp_source=${mlAffiliateId}`);
      }
    }

    return fallbackLinks;
  }
}

export const linkProcessor = new LinkProcessor();
