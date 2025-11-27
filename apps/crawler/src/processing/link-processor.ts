import { Api } from 'telegram';
import type { AffiliateConfig } from '../config';
import type { TelegramMessage } from '../telegram/client';
import { rewriteLinks } from '../affiliates/rewriter';
import { logger } from '../logger';

const LINK_REGEX = /https?:\/\/\S+/gi;

class LinkProcessor {
  /**
   * Extracts all links from a Telegram message
   */
  extractLinks(message: TelegramMessage): string[] {
    const links: string[] = [];
    const text = message.message || '';

    // 1) Plain text links
    const textLinks = text.match(LINK_REGEX);
    if (textLinks) links.push(...textLinks);

    // 2) Entity links (MessageEntityTextUrl)
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity instanceof Api.MessageEntityTextUrl) {
          if (entity.url) links.push(entity.url);
        }
      }
    }

    // Dedupe preserving order
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

  /**
   * Filters out irrelevant links (Telegram channels, social pages, etc)
   */
  filterRelevantLinks(links: string[]): string[] {
    if (!links || links.length === 0) return [];

    return links.filter(link => {
      // Ignorar links para canais do Telegram
      if (link.includes('t.me/')) return false;

      // Ignorar links encurtados para canais
      if (link.includes('bit.ly/canal') ||
          link.includes('adrena.click/ofertas') ||
          link.includes('linkmc.click/ofertas')) return false;

      // Ignorar links para páginas sociais do Mercado Livre
      if (link.includes('mercadolivre.com.br/social/')) return false;

      // Manter links de produtos específicos
      if (link.includes('amazon.com.br/dp/') ||
          link.includes('mercadolivre.com.br/p/MLB')) return true;

      if (link.includes('shopee.com.br') && link.includes('/product/')) return true;

      if (link.includes('aliexpress.com/item/')) return true;

      // Manter links de cupons
      if (link.includes('mercadolivre.com.br/cupons') ||
          link.includes('amazon.com.br/promotion')) return true;

      // Manter links encurtados que podem ser produtos
      if (link.includes('curt.link/') ||
          link.includes('tidd.ly/') ||
          link.includes('mercadolivre.com/sec/')) return true;

      if (link.includes('natura.divulgador.link/')) return true;

      // Por padrão, manter links que não foram explicitamente filtrados
      return true;
    });
  }

  /**
   * Processes links from a message: extract, filter, and rewrite with affiliate IDs
   */
  async processLinks(message: TelegramMessage, affiliateConfig: AffiliateConfig): Promise<string[]> {
    const extractedLinks = this.extractLinks(message);
    if (extractedLinks.length === 0) {
      return [];
    }

    const filteredLinks = this.filterRelevantLinks(extractedLinks);
    if (filteredLinks.length === 0) {
      return [];
    }

    logger.info(`Processing ${filteredLinks.length} links from message #${message.id}`);

    // Rewrite links with affiliate IDs
    const rewrittenLinks = await rewriteLinks(filteredLinks, affiliateConfig);

    return rewrittenLinks;
  }

  /**
   * Generates fallback links for coupons when no product links are present
   */
  generateCouponFallbackLinks(store: string | null, affiliateConfig: AffiliateConfig): string[] {
    const fallbackLinks: string[] = [];

    if (!store) return fallbackLinks;

    const storeLower = store.toLowerCase();

    // Mercado Livre - página de cupons
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
