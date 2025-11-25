import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Api, TelegramClient } from 'telegram';
import type { DealPayload, Media } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

const LINK_REGEX = /https?:\/\/\S+/gi;

// ============================================================================
// TEXT CLEANING
// ============================================================================

/**
 * Removes call-to-action footers from promo messages.
 * Common patterns:
 * - "💰Entre no nosso grupo de ofertas:"
 * - "📱 GARIMPOS DO DE PINHO 📱"
 * - Links to Telegram/Whatsapp groups
 */
export function cleanPromoText(text: string): string {
  // Split by lines
  const lines = text.split('\n');
  const cleanedLines: string[] = [];
  let foundFooter = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect footer patterns
    const isFooterLine =
      // "Link pra entrar no grupo:" pattern
      /link pra entrar no grupo/iu.test(trimmed) ||
      // "💰Entre no nosso grupo" pattern
      /💰\s*entre\s+no\s+nosso\s+grupo/iu.test(trimmed) ||
      // "Telegram:" or "Whatsapp:" labels
      /^(telegram|whatsapp):\s*$/i.test(trimmed) ||
      // Channel promotion with emojis (e.g., "📱 GARIMPOS DO DE PINHO 📱")
      /^[📱🎯💰🔥✨]+\s*[A-Z\s]+[📱🎯💰🔥✨]+\s*$/iu.test(trimmed) ||
      // t.me or bit.ly links after footer started
      (foundFooter && /https?:\/\/(t\.me|bit\.ly|chat\.whatsapp\.com)/i.test(trimmed));

    if (isFooterLine) {
      foundFooter = true;
      continue; // Skip this line
    }

    // If we found footer and this is an empty line, skip it
    if (foundFooter && trimmed === '') {
      continue;
    }

    // If we haven't found footer yet, keep the line
    if (!foundFooter) {
      cleanedLines.push(line);
    }
  }

  // Join back and trim trailing whitespace
  return cleanedLines.join('\n').trimEnd();
}

// ============================================================================
// LINK EXTRACTION
// ============================================================================

export function extractLinks(message: Api.Message): string[] {
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

  // 3) Inline keyboard buttons
  if (message.replyMarkup) {
    if (message.replyMarkup instanceof Api.ReplyInlineMarkup) {
      for (const row of message.replyMarkup.rows) {
        for (const btn of row.buttons) {
          if (btn instanceof Api.KeyboardButtonUrl) {
            links.push(btn.url);
          } else if (btn instanceof Api.KeyboardButtonUrlAuth) {
            links.push(btn.url);
          }
        }
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

// ============================================================================
// MEDIA DESCRIPTION
// ============================================================================

export function describeMedia(media: Api.TypeMessageMedia): Media {
  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo;
    if (photo instanceof Api.Photo) {
      return {
        type: 'photo',
        photo_id: photo.id,
      };
    }
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      const mimeType = doc.mimeType || undefined;
      return {
        type: 'document',
        mime: mimeType,
        doc_id: doc.id,
      };
    }
  }

  if (media instanceof Api.MessageMediaWebPage) {
    const webpage = media.webpage;
    if (webpage instanceof Api.WebPage) {
      return {
        type: 'webpage',
        url: webpage.url || undefined,
        site_name: webpage.siteName || null,
        title: webpage.title || null,
        description: webpage.description || null,
        has_photo: webpage.photo !== undefined,
      };
    }
  }

  throw new Error(`Unsupported media type: ${media.className}`);
}

// ============================================================================
// COUPON FALLBACK LINKS
// ============================================================================

/**
 * Gera links de fallback para cupons quando não há link de produto
 */
export function generateCouponFallbackLinks(
  store: string | null,
  affiliateConfig: { mercadolivre?: string },
): string[] {
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

  // Adicione outras lojas conforme necessário
  // Amazon - página de ofertas do dia
  // if (storeLower.includes('amazon')) {
  //   fallbackLinks.push(`https://www.amazon.com.br/deals?tag=${amazonTag}`);
  // }

  return fallbackLinks;
}

// ============================================================================
// WEBHOOK
// ============================================================================

export async function postWebhook(
  payload: DealPayload,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': webhookSecret,
  };

  try {
    await axios.post(webhookUrl, payload, { headers, timeout: 5000 });
  } catch (error) {
    console.error('Webhook failed:', error);
  }
}

// ============================================================================
// MEDIA DOWNLOAD
// ============================================================================

export async function downloadAndNotify(
  client: TelegramClient,
  photoId: Api.long,
  messageId: number,
  chatId: string,
  mediaDir: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  try {
    // Get message (convert chatId to number for API call)
    const messages = await client.getMessages(Number(chatId), { ids: messageId });
    const message = Array.isArray(messages) ? messages[0] : messages;
    if (!message || !message.media) {
      console.log(`✗ No media found for ${chatId}#${messageId}`);
      return;
    }

    // Download
    console.log(`⬇ Downloading photo ${photoId}...`);

    // Use photo_id as filename for uniqueness and deduplication
    const filename = `${photoId}.jpg`;
    const filepath = path.join(mediaDir, filename);
    const relativeMediaPath = `media/${filename}`;

    // Check if file already exists (deduplication)
    try {
      await fs.access(filepath);
      console.log(`✓ Photo already exists: ${filename}`);
      await notifyBackendImageReady(photoId, relativeMediaPath, webhookUrl, webhookSecret);
      return;
    } catch {
      // File doesn't exist, proceed with download
    }

    await fs.mkdir(mediaDir, { recursive: true });
    const buffer = await client.downloadMedia(message);
    if (buffer) {
      await fs.writeFile(filepath, buffer);
    }
    console.log(`✓ Downloaded: ${filepath}`);

    // Notify backend with relative path
    await notifyBackendImageReady(photoId, relativeMediaPath, webhookUrl, webhookSecret);
  } catch (error) {
    console.error(`✗ Error downloading ${photoId}:`, error);
  }
}

export async function notifyBackendImageReady(
  photoId: Api.long,
  localPath: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': webhookSecret,
    };
    const payload = {
      photo_id: photoId,
      local_path: localPath,
    };

    const imageWebhook = webhookUrl.replace('/api/deals', '/api/deals/image');
    console.log(`→ Notifying backend: POST ${imageWebhook}`);

    await axios.post(imageWebhook, payload, { headers, timeout: 5000 });
    console.log(`✓ Backend notified: ${photoId}`);
  } catch (error) {
    console.error('✗ Failed to notify backend:', error);
  }
}

// ============================================================================
// FILTER LINKS
// ============================================================================
/**
 * Filtra links irrelevantes como canais de Telegram, links de afiliados para páginas sociais, etc.
 * Mantém apenas links que apontam para produtos ou páginas relevantes.
 */
export function filterRelevantLinks(links: string[]): string[] {
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

    // Manter links de produtos específicos (Amazon, ML, etc)
    if (link.includes('amazon.com.br/dp/') ||
        link.includes('mercadolivre.com.br/p/MLB')) return true;

    // Manter links de produtos Shopee
    if (link.includes('shopee.com.br') && link.includes('/product/')) return true;

    // Manter links de produtos AliExpress
    if (link.includes('aliexpress.com/item/')) return true;

    // Manter links de cupons específicos
    if (link.includes('mercadolivre.com.br/cupons') ||
        link.includes('amazon.com.br/promotion')) return true;

    // Manter links encurtados que não são para canais (podem ser produtos)
    if (link.includes('curt.link/') ||
        link.includes('tidd.ly/') ||
        link.includes('mercadolivre.com/sec/')) return true;

    // Manter links da Natura
    if (link.includes('natura.divulgador.link/')) return true;

    // Para links da Amazon que não são de produtos específicos, verificar se são relevantes
    // if (link.includes('amazon.com.br')) {
    //   // Ignorar links para a página principal com parâmetros de afiliados
    //   if (link.match(/amazon\.com\.br\/\?.*tag=/)) return false;

    //   // Manter links para blackfriday e outras páginas de ofertas
    //   return true;
    // }

    // Por padrão, manter links que não foram explicitamente filtrados
    return true;
  });
}
