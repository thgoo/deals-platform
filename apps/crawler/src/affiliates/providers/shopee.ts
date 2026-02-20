import axios from 'axios';
import crypto from 'crypto';
import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

interface ShopeeGraphQLResponse {
  data?: {
    generateShortLink?: {
      shortLink?: string;
    };
  };
  errors?: {
    message: string;
    extensions?: {
      code?: string;
    };
  }[];
}

class ShopeeProvider implements AffiliateProvider {
  readonly name = 'shopee';
  private appId: string | null = null;
  private secret: string | null = null;

  configure(config: AffiliateConfig): void {
    const shopeeConfig = config.shopee;
    if (shopeeConfig?.appId && shopeeConfig?.secret) {
      this.appId = shopeeConfig.appId;
      this.secret = shopeeConfig.secret;
    }
  }

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('shopee.com.br');
  }

  private isConfigured(): boolean {
    return this.appId !== null && this.secret !== null;
  }

  /**
   * Generates SHA256 signature for authentication
   * Signature = SHA256(AppId + Timestamp + Payload + Secret)
   */
  private generateSignature(timestamp: number, payload: string): string {
    const signString = `${this.appId}${timestamp}${payload}${this.secret}`;
    return crypto.createHash('sha256').update(signString, 'utf8').digest('hex');
  }

  /**
   * Generates authorization header
   * Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
   */
  private generateAuthHeader(timestamp: number, payload: string): string {
    const signature = this.generateSignature(timestamp, payload);
    return `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${signature}`;
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('Shopee API not configured, skipping affiliate rewrite');
      return null;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);

      const payload = JSON.stringify({
        query: `mutation { generateShortLink(input: { originUrl: "${url}" }) { shortLink } }`,
      });

      const authHeader = this.generateAuthHeader(timestamp, payload);

      logger.info('Calling Shopee API', { productUrl: url });

      const response = await axios.post<ShopeeGraphQLResponse>(
        'https://open-api.affiliate.shopee.com.br/graphql',
        payload,
        {
          timeout: 10000,
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.errors?.length) {
        const errorMsg = response.data.errors[0]?.message ?? 'Unknown error';
        logger.warn('Shopee API returned error', { error: errorMsg });
        return null;
      }

      const shortLink = response.data.data?.generateShortLink?.shortLink;

      if (shortLink) {
        logger.info('Shopee affiliate link generated successfully', { shortLink });
        return shortLink;
      }

      logger.warn('Failed to extract affiliate link from Shopee API response');
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error calling Shopee API', { error: errorMsg });
      return null;
    }
  }
}

export const shopeeProvider = new ShopeeProvider();
