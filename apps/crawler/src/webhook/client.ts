import axios from 'axios';
import { logger } from '../logger';
import type { DealPayload } from '../shared/types';
import { config } from '../config';

class WebhookClient {
  async sendDeal(payload: DealPayload): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.deals}`;
    
    try {
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.backend.secret,
      };

      await axios.post(url, payload, { headers, timeout: 5000 });
      logger.info(`Deal sent to backend`, { chat: payload.chat, messageId: payload.message_id });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send deal', { error: errorMsg, url });
    }
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
      logger.info(`Media notification sent`, { photoId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send media notification', { error: errorMsg, photoId });
    }
  }
}

export const webhookClient = new WebhookClient();
