import type { DealPayload } from '../shared/types';
import type { TelegramIncomingMessage } from '../telegram';
import { config } from '../config';
import { logger } from '../logger';
import { mediaDownloader } from '../media/downloader';
import { ProcessingError } from '../shared/errors';
import { getCurrentTelegramGateway } from '../telegram/runtime';
import { webhookClient } from '../webhook/client';
import { aiExtractor } from './ai-extractor';
import { linkProcessor } from './link-processor';
import { cleanPromoText } from './text-cleaner';
import { calculateMessageLatency } from './utils';

class MessageHandler {
  async handle(message: TelegramIncomingMessage): Promise<void> {
    try {
      const { id, chat, text: rawText, date } = message;

      if (chat.type !== 'channel') {
        logger.debug('Message is not from a channel, skipping');
        return;
      }

      const chatId = chat.id;
      const chatAlias = await getCurrentTelegramGateway().resolveChatAlias(chatId);

      const cleanedText = cleanPromoText(rawText);

      const { final: links, allVersions: linksForExtractor } =
        await linkProcessor.processLinks(message, config.affiliates);

      const serverTs = new Date(date * 1000);
      const { formattedLatency } = calculateMessageLatency(date);

      logger.info('Message received', {
        chat: chatAlias,
        messageId: id,
        latency: formattedLatency,
        linksCount: links.length,
        textLength: cleanedText.length,
      });

      if (!links.length && !cleanedText.toLowerCase().includes('r$')) {
        logger.debug('Message has no links and no price mention, skipping');
        return;
      }

      let extraction;
      try {
        extraction = await aiExtractor.extract(
          cleanedText,
          chatAlias,
          id,
          linksForExtractor,
        );
      } catch (error) {
        logger.error('AI extraction failed, skipping message', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      let finalLinks = links;
      if (extraction.coupons.length > 0 && links.length === 0) {
        const fallbackLinks = linkProcessor.generateCouponFallbackLinks(
          extraction.store,
          config.affiliates,
        );
        if (fallbackLinks.length > 0) {
          finalLinks = fallbackLinks;
          logger.info('Added fallback link for coupons', { store: extraction.store });
        }
      }

      const payload: DealPayload = {
        message_id: id,
        chat: chatAlias,
        chat_id: chatId,
        ts: serverTs.toISOString(),
        text: cleanedText,
        links: finalLinks,
        price: extraction.price ?? undefined,
        coupons: extraction.coupons.length > 0 ? extraction.coupons : undefined,
        store: extraction.store ?? undefined,
        description: extraction.description ?? undefined,
        product: extraction.product ?? undefined,
        product_key: extraction.productKey ?? undefined,
        category: extraction.category ?? undefined,
      };

      if (extraction.product === null) {
        // Coupon-only deal: skip Telegram media download, use default coupon image
        payload.media = { type: 'unknown', local_path: 'coupon.png' };
      } else if (message.media) {
        payload.media = message.media;

        if (message.media.type === 'photo' && message.media.photo_id) {
          const photoId = message.media.photo_id;
          mediaDownloader.enqueuePhotoDownload(photoId, id, chatId, config.media.dir, async filePath => {
            const filename = filePath.split('/').pop() || '';
            const relativePath = `media/${filename}`;
            await webhookClient.sendMediaNotification(photoId, relativePath);
          });
        }
      }

      try {
        await webhookClient.sendDeal(payload);
      } catch (error) {
        // Retries exhausted — log with full context and move on.
        // The deal is lost but processing should continue for future messages.
        logger.error('Failed to send deal after retries', {
          chat: chatAlias,
          messageId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error processing message', { error: errorMsg });
      throw new ProcessingError('Failed to process message', error);
    }
  }
}

export const messageHandler = new MessageHandler();
