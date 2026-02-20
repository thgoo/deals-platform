import axios from 'axios';
import type { DealPayload } from '../shared/types';
import { config } from '../config';
import { logger } from '../logger';
import { RETRY_PRESETS, withRetry } from '../shared/retry';

class WebhookClient {
  async sendDeal(payload: DealPayload): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.deals}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': config.backend.secret,
    };

    await withRetry(
      async () => {
        const response = await axios.post(url, payload, { headers, timeout: 5000 });
        logger.info('Deal sent to backend', { chat: payload.chat, messageId: payload.message_id });
        return response;
      },
      RETRY_PRESETS.STANDARD,
      error => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === undefined) return true; // network/timeout error
          return status >= 500;
        }
        return true;
      },
    );
  }

  async sendMediaNotification(photoId: string, localPath: string): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.dealsImage}`;

    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.backend.secret,
      };

      const payload = {
        photo_id: photoId,
        local_path: localPath,
      };

      await axios.post(url, payload, { headers, timeout: 5000 });
      logger.info('Media notification sent', { photoId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send media notification', { error: errorMsg, photoId });
    }
  }
}

export const webhookClient = new WebhookClient();
