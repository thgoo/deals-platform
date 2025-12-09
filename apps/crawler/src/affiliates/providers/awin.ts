import axios from 'axios';
import type { AffiliateProvider } from './base';
import { logger } from '../../logger';
import { removeUrlParams } from '../../processing/utils';

const AWIN_API_URL = 'https://api.awin.com/publishers';

// Mapeamento de domínios para advertiser IDs na Awin
const ADVERTISER_IDS: Record<string, number> = {
  'kabum.com.br': 17729,
  'adidas.com.br': 79926,
  'nike.com.br': 17652,
};

export interface AwinConfig {
  publisherId: string;
  token: string;
}

class AwinProvider implements AffiliateProvider {
  readonly name = 'awin';

  canHandle(url: string): boolean {
    const urlLower = url.toLowerCase();
    return Object.keys(ADVERTISER_IDS).some(domain => urlLower.includes(domain));
  }

  async rewrite(url: string, config: unknown): Promise<string | null> {
    const awinConfig = config as AwinConfig;
    if (!awinConfig?.publisherId || !awinConfig?.token) {
      return null;
    }

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
        `${AWIN_API_URL}/${awinConfig.publisherId}/linkbuilder/generate`,
        {
          advertiserId,
          destinationUrl: cleanUrl,
          shorten: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${awinConfig.token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      if (response.data?.url) {
        logger.debug(`Awin link generated: ${response.data.url}`);
        return response.data.url;
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
