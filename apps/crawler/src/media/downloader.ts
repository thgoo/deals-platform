import * as fs from 'fs/promises';
import * as path from 'path';
import { Api } from 'telegram';
import type { MediaInfo } from '../shared/types';
import { logger } from '../logger';
import { telegramClient } from '../telegram/client';

// Type helpers for Telegram API objects
interface TelegramDocument {
  id: bigint;
  mimeType?: string;
  attributes?: { className?: string; fileName?: string }[];
}

interface TelegramWebPage {
  url?: string;
  title?: string;
  description?: string;
}

class MediaDownloader {
  async ensureMediaDir(mediaDir: string): Promise<void> {
    try {
      await fs.mkdir(mediaDir, { recursive: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create media directory ${mediaDir}`, { error: errorMsg });
      throw error;
    }
  }

  extractMediaInfo(media: Api.TypeMessageMedia): MediaInfo | null {
    if (media instanceof Api.MessageMediaPhoto) {
      return {
        type: 'photo',
        photo_id: media.photo?.id.toString(),
      };
    }

    if (media instanceof Api.MessageMediaDocument && media.document) {
      const doc = media.document as unknown as TelegramDocument;
      const attributes = doc.attributes || [];
      const fileNameAttr = attributes.find(attr => attr.className === 'DocumentAttributeFilename');

      return {
        type: 'document',
        document_id: doc.id.toString(),
        mime_type: doc.mimeType || undefined,
        file_name: fileNameAttr?.fileName,
      };
    }

    if (media instanceof Api.MessageMediaWebPage && media.webpage) {
      const webpage = media.webpage as unknown as TelegramWebPage;

      return {
        type: 'webpage',
        webpage_url: webpage.url || undefined,
        webpage_title: webpage.title || undefined,
        webpage_description: webpage.description || undefined,
      };
    }

    return { type: 'unknown' };
  }

  async downloadPhoto(
    photoId: string,
    messageId: number,
    chatId: string,
    mediaDir: string,
  ): Promise<string | null> {
    try {
      const client = telegramClient.getClient();
      const fileName = `${photoId}.jpg`;
      const filePath = path.join(mediaDir, fileName);

      // Check if file already exists (deduplication)
      try {
        await fs.access(filePath);
        logger.info(`Photo already exists: ${fileName}`);
        return filePath;
      } catch {
        // File doesn't exist, continue with download
      }

      await this.ensureMediaDir(mediaDir);

      // Get message and download
      const messages = await client.getMessages(parseInt(chatId, 10), { ids: messageId });
      const message = Array.isArray(messages) ? messages[0] : messages;

      if (message && message.media) {
        const buffer = await client.downloadMedia(message);
        if (buffer) {
          await fs.writeFile(filePath, buffer);
          logger.info(`Downloaded media to ${filePath}`);
          return filePath;
        }
      }

      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to download media', { error: errorMsg });
      return null;
    }
  }
}

export const mediaDownloader = new MediaDownloader();
