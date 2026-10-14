import crypto from 'node:crypto';
import type { AffiliateRewriter } from '../types';
import type { AliExpressApiConfig } from '~/link-pipeline/config';
import { cleanUrl } from '~/link-pipeline/utils/url-utils';
import { logger } from '~/logger';

const ALIEXPRESS_API_URL = 'https://api-sg.aliexpress.com/sync';
const ALIEXPRESS_API_TIMEOUT_MS = 10_000;

interface AliExpressApiResponse {
  aliexpress_affiliate_link_generate_response?: {
    resp_result?: {
      result?: {
        promotion_links?: {
          promotion_link?: { promotion_link?: string }[];
        };
      };
    };
  };
}

export default class AliExpressRewriter implements AffiliateRewriter {
  readonly name = 'aliexpress';

  constructor(private readonly cfg: AliExpressApiConfig | null) {}

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('aliexpress.com') || lower.includes('s.click.aliexpress.com');
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.cfg) {
      logger.warn('AliExpress API not configured, skipping affiliate rewrite');
      return null;
    }

    const cleanedUrl = cleanUrl(url);
    const apiUrl = this.buildApiUrl(cleanedUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ALIEXPRESS_API_TIMEOUT_MS);

    try {
      logger.info('Calling AliExpress API', { productUrl: cleanedUrl });

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn('AliExpress API returned non-OK status', { status: response.status });
        return null;
      }

      const data = await response.json() as AliExpressApiResponse;
      const link = data
        .aliexpress_affiliate_link_generate_response
        ?.resp_result?.result?.promotion_links?.promotion_link?.[0]?.promotion_link;

      if (link) {
        logger.info('AliExpress affiliate link generated');
        return link;
      }
      logger.warn('AliExpress API returned no promotion link');
      return null;
    } catch (error) {
      logger.error('Error calling AliExpress API', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Signs the API request per AliExpress's spec:
   * MD5(appSecret + sortedConcat(key+value) + appSecret).toUpperCase()
   */
  private signParams(params: Record<string, string>, appSecret: string): string {
    const sortedKeys = Object.keys(params).sort();
    let signString = appSecret;
    for (const key of sortedKeys) signString += key + params[key];
    signString += appSecret;
    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
  }

  private buildApiUrl(productUrl: string): string {
    if (!this.cfg) throw new Error('AliExpress config missing');

    const params: Record<string, string> = {
      app_key: this.cfg.appKey,
      format: 'json',
      method: 'aliexpress.affiliate.link.generate',
      promotion_link_type: '0',
      ship_to_country: 'BR',
      sign_method: 'md5',
      source_values: productUrl,
      timestamp: Date.now().toString(),
      tracking_id: this.cfg.trackingId,
      v: '1',
    };

    params['sign'] = this.signParams(params, this.cfg.appSecret);
    const queryString = new URLSearchParams(params).toString();
    return `${ALIEXPRESS_API_URL}?${queryString}`;
  }
}
