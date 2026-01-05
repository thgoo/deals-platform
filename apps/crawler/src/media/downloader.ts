import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';
import { getCurrentTelegramGateway } from '../telegram/runtime';

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

  async downloadPhoto(
    photoId: string,
    messageId: number,
    chatId: string,
    mediaDir: string,
  ): Promise<string | null> {
    try {
      const fileName = `${photoId}.jpg`;
      const filePath = path.join(mediaDir, fileName);

      try {
        await fs.access(filePath);
        logger.info(`Photo already exists: ${fileName}`);
        return filePath;
      } catch {
        // File doesn't exist, proceed with download
      }

      await this.ensureMediaDir(mediaDir);

      const downloaded = await getCurrentTelegramGateway().downloadMessageMedia(chatId, messageId);
      if (downloaded) {
        await fs.writeFile(filePath, downloaded);
        logger.info(`Downloaded media to ${filePath}`);
        return filePath;
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
