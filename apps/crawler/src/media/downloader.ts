import { logger } from '../logger';
import { getCurrentTelegramGateway } from '../telegram/runtime';
import { downloadQueue } from './queue';

class MediaDownloader {
  /**
   * Downloads a message's photo in the background (bounded queue) and hands the
   * bytes to `onDownloaded` — which uploads them to the api. Nothing is written
   * to disk here: the api stores and serves deal photos.
   */
  enqueuePhotoDownload(
    photoId: string,
    messageId: number,
    chatId: string,
    onDownloaded: (bytes: Uint8Array) => Promise<void>,
  ): void {
    downloadQueue.enqueue(async () => {
      const bytes = await this.downloadPhoto(photoId, messageId, chatId);
      if (bytes) {
        await onDownloaded(bytes);
      }
    });
  }

  private async downloadPhoto(photoId: string, messageId: number, chatId: string): Promise<Uint8Array | null> {
    try {
      const downloaded = await getCurrentTelegramGateway().downloadMessageMedia(chatId, messageId);
      if (!downloaded) return null;
      logger.info('Media downloaded', { photoId, bytes: downloaded.byteLength });
      return new Uint8Array(downloaded);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to download media', { photoId, error: errorMsg });
      return null;
    }
  }
}

export const mediaDownloader = new MediaDownloader();
