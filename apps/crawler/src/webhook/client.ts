import type { DealPayload } from '../shared/types';
import { config } from '../config';
import { logger } from '../logger';
import { RETRY_PRESETS, withRetry } from '../shared/retry';

// Long timeout: core-api now runs link expansion + AI extraction synchronously
// when ingesting a deal, and the AI extraction call itself can wait up to ~120s
// for ai-service to finish its internal retry budget. 180s gives the full
// pipeline room to breathe before we treat the request as lost.
const SEND_TIMEOUT_MS = 180_000;

class WebhookClient {
  async sendDeal(payload: DealPayload): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.deals}`;

    await withRetry(
      async () => {
        const response = await this.post(url, payload, SEND_TIMEOUT_MS);
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          throw Object.assign(
            new Error(`HTTP ${response.status}: ${errorBody}`),
            { statusCode: response.status },
          );
        }
        logger.info('Deal sent to backend', {
          chat: payload.chat,
          messageId: payload.message_id,
        });
      },
      RETRY_PRESETS.STANDARD,
      error => {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === undefined) return true; // network/timeout error
        return status >= 500;
      },
    );
  }

  async sendMediaNotification(photoId: string, localPath: string): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.dealsImage}`;
    const payload = { photo_id: photoId, local_path: localPath };

    try {
      const response = await this.post(url, payload, 5_000);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      logger.info('Media notification sent', { photoId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send media notification', { error: errorMsg, photoId });
    }
  }

  private async post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.backend.secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
}

export const webhookClient = new WebhookClient();
