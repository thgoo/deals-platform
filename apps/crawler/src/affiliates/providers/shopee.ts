import axios from 'axios';
import crypto from 'crypto';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';

interface ShopeeApiConfig {
  appId: string;
  secret: string;
}

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
  private config: ShopeeApiConfig | null = null;

  configure(appId: string, secret: string): void {
    this.config = { appId, secret };
  }

  canHandle(url: string): boolean {
    return url.toLowerCase().includes('shopee.com.br');
  }

  isConfigured(): boolean {
    return this.config !== null &&
           this.config.appId !== '' &&
           this.config.secret !== '';
  }

  /**
   * Gera a assinatura SHA256 para autenticação
   * Signature = SHA256(AppId + Timestamp + Payload + Secret)
   */
  private generateSignature(timestamp: number, payload: string): string {
    if (!this.config) {
      throw new Error('Shopee provider not configured');
    }

    const signString = `${this.config.appId}${timestamp}${payload}${this.config.secret}`;
    return crypto.createHash('sha256').update(signString, 'utf8').digest('hex');
  }

  /**
   * Gera o header de autorização
   * Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={Signature}
   */
  private generateAuthHeader(timestamp: number, payload: string): string {
    if (!this.config) {
      throw new Error('Shopee provider not configured');
    }

    const signature = this.generateSignature(timestamp, payload);
    return `SHA256 Credential=${this.config.appId}, Timestamp=${timestamp}, Signature=${signature}`;
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
