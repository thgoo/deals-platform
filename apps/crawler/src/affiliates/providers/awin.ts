import axios from 'axios';
import type { AffiliateConfig } from '../../config';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';
import { removeUrlParams } from '../../processing/utils';

const AWIN_API_URL = 'https://api.awin.com/publishers';

const ADVERTISER_IDS: Record<string, number> = {
  'kabum.com.br': 17729,
  'adidas.com.br': 79926,
  'nike.com.br': 17652,
};

class AwinProvider implements AffiliateProvider {
  readonly name = 'awin';
  private publisherId: string | null = null;
  private token: string | null = null;

  configure(config: AffiliateConfig): void {
    const awinConfig = config.awin;
    if (awinConfig?.publisherId && awinConfig?.token) {
      this.publisherId = awinConfig.publisherId;
      this.token = awinConfig.token;
    }
  }

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return Object.keys(ADVERTISER_IDS).some(domain => urlLower.includes(domain));
  }

  private isConfigured(): boolean {
    return this.publisherId !== null && this.token !== null;
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.isConfigured()) return null;

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');

      const advertiserId = Object.entries(ADVERTISER_IDS)
        .find(([d]) => domain.includes(d))?.[1];

      if (!advertiserId) {
        logger.debug(`No Awin advertiser ID found for domain: ${domain}`);
        return null;
      }

      const AWIN_PARAMS = ['aw_affid', 'awc', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
      const cleanUrl = removeUrlParams(url, AWIN_PARAMS);

      logger.debug(`Generating Awin link for ${cleanUrl}`, { advertiserId });

      const response = await axios.post(
        `${AWIN_API_URL}/${this.publisherId}/linkbuilder/generate`,
        {
          advertiserId,
          destinationUrl: cleanUrl,
          shorten: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const generatedUrl = response.data?.shortUrl || response.data?.url;
      if (generatedUrl) {
        logger.debug(`Awin link generated: ${generatedUrl}`);
        return generatedUrl;
      }

      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to generate Awin link for ${url}`, { error: errorMsg });
      return null;
    }
  }
}

export const awinProvider = new AwinProvider();
