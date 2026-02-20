import axios from 'axios';
import crypto from 'crypto';
import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';
import { cleanUrl } from '../../processing/utils';

interface AliExpressApiResponse {
  aliexpress_affiliate_link_generate_response?: {
    resp_result?: {
      result?: {
        promotion_links?: {
          promotion_link?: {
            promotion_link?: string;
            source_value?: string;
          }[];
        };
      };
    };
  };
}

class AliExpressProvider implements AffiliateProvider {
  readonly name = 'aliexpress';
  private appKey: string | null = null;
  private appSecret: string | null = null;
  private trackingId: string | null = null;

  configure(config: AffiliateConfig): void {
    const aliConfig = config.aliexpress;
    if (aliConfig?.appKey && aliConfig?.appSecret && aliConfig?.trackingId) {
      this.appKey = aliConfig.appKey;
      this.appSecret = aliConfig.appSecret;
      this.trackingId = aliConfig.trackingId;
    }
  }

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('aliexpress.com') || urlLower.includes('s.click.aliexpress.com');
  }

  private isConfigured(): boolean {
    return this.appKey !== null && this.appSecret !== null && this.trackingId !== null;
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.isConfigured()) {
      logger.warn('AliExpress API not configured, skipping affiliate rewrite');
      return null;
    }

    try {
      const cleanedUrl = cleanUrl(url);
      const apiUrl = this.generateApiUrl(cleanedUrl);

      logger.info('Calling AliExpress API', { productUrl: cleanedUrl });

      const response = await axios.get<AliExpressApiResponse>(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const affiliateLink = response.data
        ?.aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links?.promotion_link?.[0]?.promotion_link;

      if (affiliateLink) {
        logger.info('AliExpress affiliate link generated successfully');
        return affiliateLink;
      }

      logger.warn('Failed to extract affiliate link from AliExpress API response');
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Error calling AliExpress API', { error: errorMsg });
      return null;
    }
  }

  /**
   * Generates MD5 signature for API authentication
   * Formula: MD5(appSecret + sortedParams + appSecret).toUpperCase()
   */
  private generateSign(params: Record<string, string>): string {
    const sortedKeys = Object.keys(params).sort();

    let signString = this.appSecret!;
    for (const key of sortedKeys) {
      signString += key + params[key];
    }
    signString += this.appSecret!;

    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
  }

  private generateApiUrl(productUrl: string): string {
    const timestamp = Date.now().toString();

    const params: Record<string, string> = {
      app_key: this.appKey!,
      format: 'json',
      method: 'aliexpress.affiliate.link.generate',
      promotion_link_type: '0',
      ship_to_country: 'BR',
      sign_method: 'md5',
      source_values: productUrl,
      timestamp,
      tracking_id: this.trackingId!,
      v: '1',
    };

    const sign = this.generateSign(params);
    params.sign = sign;

    const queryString = new URLSearchParams(params).toString();
    return `https://api-sg.aliexpress.com/sync?${queryString}`;
  }
}

export const aliExpressProvider = new AliExpressProvider();
