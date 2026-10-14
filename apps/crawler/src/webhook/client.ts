import type { DealPayload } from '../shared/types';
import { config } from '../config';
import { logger } from '../logger';
import { RETRY_PRESETS, withRetry } from '../shared/retry';

// The api only stores the message and answers (processing happens in its
// ingestion worker), so a reply takes milliseconds. Retrying is safe: the api
// recognises a message it already has and answers it as deduped.
const SEND_TIMEOUT_MS = 15_000;
const PHOTO_TIMEOUT_MS = 30_000;

/** Network errors, timeouts and 5xx are worth retrying; 4xx are not. */
function isTransient(error: unknown): boolean {
  const status = (error as { statusCode?: number }).statusCode;
  return status === undefined || status >= 500;
}

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
      isTransient,
    );
  }

  /** Uploads a downloaded deal photo; the api stores it and attaches it to the deal. */
  async uploadPhoto(photoId: string, bytes: Uint8Array): Promise<void> {
    const url = `${config.backend.baseUrl}${config.backend.endpoints.photos}/${encodeURIComponent(photoId)}`;

    try {
      await withRetry(
        async () => {
          const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg', 'X-Webhook-Secret': config.backend.secret },
            body: bytes,
            signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
          });
          if (!response.ok) {
            const errorBody = await response.text().catch(() => '');
            throw Object.assign(new Error(`HTTP ${response.status}: ${errorBody}`), { statusCode: response.status });
          }
        },
        RETRY_PRESETS.STANDARD,
        isTransient,
      );
      logger.info('Photo uploaded', { photoId, bytes: bytes.byteLength });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to upload photo', { photoId, error: errorMsg });
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
