import crypto from 'node:crypto';
import type { AffiliateRewriter } from '../types';
import type { ShopeeApiConfig } from '~/link-pipeline/config';
import { logger } from '~/logger';

const SHOPEE_GRAPHQL_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const SHOPEE_TIMEOUT_MS = 10_000;

interface ShopeeGraphQLResponse {
  data?: {
    generateShortLink?: {
      shortLink?: string;
    };
  };
  errors?: {
    message: string;
    extensions?: { code?: string };
  }[];
}

export default class ShopeeRewriter implements AffiliateRewriter {
  readonly name = 'shopee';

  constructor(private readonly cfg: ShopeeApiConfig | null) {}

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('shopee.com.br');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.cfg) {
      logger.warn('Shopee API not configured, skipping affiliate rewrite');
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      query: `mutation { generateShortLink(input: { originUrl: "${url}" }) { shortLink } }`,
    });
    const authHeader = this.buildAuthHeader(timestamp, payload);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SHOPEE_TIMEOUT_MS);

    try {
      logger.info('Calling Shopee API', { productUrl: url });

      const response = await fetch(SHOPEE_GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn('Shopee API returned non-OK status', { status: response.status });
        return null;
      }

      const data = await response.json() as ShopeeGraphQLResponse;

      if (data.errors?.length) {
        const errorMsg = data.errors[0]?.message ?? 'Unknown error';
        logger.warn('Shopee API returned error', { error: errorMsg });
        return null;
      }

      const shortLink = data.data?.generateShortLink?.shortLink;
      if (shortLink) {
        logger.info('Shopee affiliate link generated', { shortLink });
        return shortLink;
      }

      logger.warn('Shopee API returned no shortLink');
      return null;
    } catch (error) {
      logger.error('Error calling Shopee API', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Auth header per Shopee spec:
   * SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
   * Where Signature = SHA256(AppId + Timestamp + Payload + Secret)
   */
  private buildAuthHeader(timestamp: number, payload: string): string {
    if (!this.cfg) throw new Error('Shopee config missing');
    const signString = `${this.cfg.appId}${timestamp}${payload}${this.cfg.secret}`;
    const signature = crypto.createHash('sha256').update(signString, 'utf8').digest('hex');
    return `SHA256 Credential=${this.cfg.appId}, Timestamp=${timestamp}, Signature=${signature}`;
  }
}
