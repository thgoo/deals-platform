import { Api } from 'telegram';
import type { DealPayload } from '../shared/types';
import type { TelegramMessage } from '../telegram/client';
import { config } from '../config';
import { logger } from '../logger';
import { mediaDownloader } from '../media/downloader';
import { ProcessingError } from '../shared/errors';
import { telegramClient } from '../telegram/client';
import { webhookClient } from '../webhook/client';
import { aiExtractor } from './ai-extractor';
import { linkProcessor } from './link-processor';
import { cleanPromoText } from './text-cleaner';
import { calculateMessageLatency } from './utils';

class MessageHandler {
  async handle(message: TelegramMessage): Promise<void> {
    try {
      const { id, peerId, message: rawText, date } = message;

      if (!(peerId instanceof Api.PeerChannel)) {
        logger.debug('Message is not from a channel, skipping');
        return;
      }

      const chatId = peerId.channelId.toString();

      const entity = await telegramClient.getEntity(Number(peerId.channelId));
      const chatAlias = entity.className === 'Channel'
        ? (entity.username as string || chatId)
        : chatId;

      const cleanedText = cleanPromoText(rawText);

      const links = await linkProcessor.processLinks(message, config.affiliates);

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
          links,
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
      };

      if (message.media) {
        const mediaInfo = mediaDownloader.extractMediaInfo(message.media);
        if (mediaInfo) {
          payload.media = mediaInfo;
        }

        if (mediaInfo?.type === 'photo' && mediaInfo.photo_id) {
          this.downloadAndNotifyMedia(mediaInfo.photo_id, id, chatId);
        }
      }

      await webhookClient.sendDeal(payload);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error processing message', { error: errorMsg });
      throw new ProcessingError('Failed to process message', error);
    }
  }

  private async downloadAndNotifyMedia(
    photoId: string,
    messageId: number,
    chatId: string,
  ): Promise<void> {
    try {
      const filePath = await mediaDownloader.downloadPhoto(
        photoId,
        messageId,
        chatId,
        config.media.dir,
      );

      if (filePath) {
        // Extract filename and create relative path
        const filename = filePath.split('/').pop() || '';
        const relativePath = `media/${filename}`;

        await webhookClient.sendMediaNotification(photoId, relativePath);
      }
    } catch (error) {
      logger.error('Error downloading/notifying media', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const messageHandler = new MessageHandler();
