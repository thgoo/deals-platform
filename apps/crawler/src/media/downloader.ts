import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logger';
import { getCurrentTelegramGateway } from '../telegram/runtime';
import { downloadQueue } from './queue';

class MediaDownloader {
  enqueuePhotoDownload(
    photoId: string,
    messageId: number,
    chatId: string,
    mediaDir: string,
    onDownloaded: (filePath: string) => Promise<void>,
  ): void {
    downloadQueue.enqueue(async () => {
      const filePath = await this.downloadPhoto(photoId, messageId, chatId, mediaDir);
      if (filePath) {
        await onDownloaded(filePath);
      }
    });
  }

  private async ensureMediaDir(mediaDir: string): Promise<void> {
    try {
      await fs.mkdir(mediaDir, { recursive: true });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create media directory', { dir: mediaDir, error: errorMsg });
      throw error;
    }
  }

  private async downloadPhoto(
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
        logger.info('Photo already exists, skipping download', { fileName });
        return filePath;
      } catch {
        // File doesn't exist, proceed with download
      }

      await this.ensureMediaDir(mediaDir);

      const downloaded = await getCurrentTelegramGateway().downloadMessageMedia(chatId, messageId);
      if (downloaded) {
        await fs.writeFile(filePath, downloaded);
        logger.info('Media downloaded', { filePath });
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
