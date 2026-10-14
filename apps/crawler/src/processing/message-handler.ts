import type { DealPayload } from '../shared/types';
import type { TelegramIncomingMessage } from '../telegram';
import { config } from '../config';
import { logger } from '../logger';
import { mediaDownloader } from '../media/downloader';
import { ProcessingError } from '../shared/errors';
import { getCurrentTelegramGateway } from '../telegram/runtime';
import { webhookClient } from '../webhook/client';
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
      const serverTs = new Date(date * 1000);
      const { formattedLatency } = calculateMessageLatency(date);

      // Pass-through: Telegram's MessageEntity layer (parsed by mtcute) is what we hand off.
      // Any URL parsing or merging is the core-api's job — we don't peek into the text here.
      const links = message.links ?? [];

      logger.info('Message received', {
        chat: chatAlias,
        messageId: id,
        latency: formattedLatency,
        linksCount: links.length,
        textLength: rawText.length,
      });

      const payload: DealPayload = {
        message_id: id,
        chat: chatAlias,
        chat_id: chatId,
        ts: serverTs.toISOString(),
        text: rawText,
        links,
      };

      if (message.media) {
        payload.media = message.media;
      }

      // Fire-and-forget the deal POST; we hand its promise to the media callback
      // so the media notification can only land *after* the deal exists in the DB.
      // (Before this gating, the photo download often beat the deal POST — which
      //  now takes 2-20s because core-api runs the link pipeline and AI extract
      //  synchronously — and UPDATE found no row to attach the photo to.)
      const dealSentSuccessfully = this.sendDealSafely(payload, chatAlias, id);

      if (message.media?.type === 'photo' && message.media.photo_id) {
        const photoId = message.media.photo_id;
        mediaDownloader.enqueuePhotoDownload(photoId, id, chatId, config.media.dir, async filePath => {
          const ok = await dealSentSuccessfully;
          if (!ok) {
            logger.debug('Skipping media notification because deal POST failed', { photoId });
            return;
          }
          const filename = filePath.split('/').pop() || '';
          await webhookClient.sendMediaNotification(photoId, `media/${filename}`);
        });
      }

      // Wait for the deal POST to complete before returning — otherwise the handler
      // resolves while async work is still pending and the runtime may exit early.
      await dealSentSuccessfully;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error processing message', { error: errorMsg });
      throw new ProcessingError('Failed to process message', error);
    }
  }

  private async sendDealSafely(payload: DealPayload, chatAlias: string, messageId: number): Promise<boolean> {
    try {
      await webhookClient.sendDeal(payload);
      return true;
    } catch (error) {
      // Retries exhausted — log with full context and move on. The deal is lost
      // but processing should continue for future messages.
      logger.error('Failed to send deal after retries', {
        chat: chatAlias,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

export const messageHandler = new MessageHandler();
