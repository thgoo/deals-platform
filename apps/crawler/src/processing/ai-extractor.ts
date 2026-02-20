import { config } from '../config';
import { logger } from '../logger';
import { RETRY_PRESETS, withRetry } from '../shared/retry';

export interface ExtractionResult {
  price: number | null;
  coupons: string[];
  product: string | null;
  store: string | null;
  description: string | null;
  productKey: string | null;
  category: string | null;
}

interface ExtractorRequest {
  text: string;
  chat: string;
  messageId: number;
  links: string[];
}

interface ExtractorResponse {
  price: number | null;
  coupons?: string[];
  product: string | null;
  store: string | null;
  description: string | null;
  productKey: string | null;
  category: string | null;
}

class AIExtractor {
  async extract(
    text: string,
    chat: string,
    messageId: number,
    links: string[],
  ): Promise<ExtractionResult> {
    const payload: ExtractorRequest = {
      text,
      chat,
      messageId,
      links,
    };

    const serviceUrl = `${config.extractor.baseUrl}${config.extractor.endpoint}`;

    logger.info('Calling AI extractor service', {
      chat,
      messageId,
      linksCount: links.length,
    });

    try {
      return await withRetry(
        async () => {
          const response = await fetch(serviceUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000), // 10s timeout
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw Object.assign(
              new Error(`Extractor service error: ${response.status} - ${errorText}`),
              { statusCode: response.status },
            );
          }

          const data = await response.json() as ExtractorResponse;

          logger.info('AI extraction successful', {
            hasPrice: data.price !== null,
            couponsCount: data.coupons?.length || 0,
            store: data.store,
          });

          return {
            price: data.price,
            coupons: data.coupons || [],
            product: data.product,
            store: data.store,
            description: data.description,
            productKey: data.productKey,
            category: data.category,
          };
        },
        RETRY_PRESETS.STANDARD,
        error => {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === undefined) return true; // network/timeout error
          return status >= 500;
        },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('AI extraction failed', { error: errorMsg });
      throw error;
    }
  }
}

export const aiExtractor = new AIExtractor();
