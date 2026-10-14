import type { AffiliateRewriter } from '../types';
import type { AwinApiConfig } from '~/link-pipeline/config';
import { removeUrlParams } from '~/link-pipeline/utils/url-utils';
import { logger } from '~/logger';

const AWIN_API_URL = 'https://api.awin.com/publishers';
const AWIN_API_TIMEOUT_MS = 10_000;

/**
 * Advertisers in the Awin network that we want to rewrite. The key is a
 * substring matched against the URL host; the value is the Awin advertiser id.
 */
const ADVERTISER_IDS: Record<string, number> = {
  'kabum.com.br': 17729,
  'adidas.com.br': 79926,
  'nike.com.br': 17652,
};

const AWIN_TRACKING_PARAMS = [
  'aw_affid',
  'awc',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

interface AwinLinkbuilderResponse {
  shortUrl?: string;
  url?: string;
}

export default class AwinRewriter implements AffiliateRewriter {
  readonly name = 'awin';

  constructor(private readonly cfg: AwinApiConfig | null) {}

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return Object.keys(ADVERTISER_IDS).some(domain => lower.includes(domain));
  }

  async rewrite(url: string): Promise<string | null> {
    if (!this.cfg) return null;

    let domain: string;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch {
      return null;
    }

    const advertiserId = Object.entries(ADVERTISER_IDS)
      .find(([d]) => domain.includes(d))?.[1];

    if (!advertiserId) {
      logger.debug('No Awin advertiser ID for domain', { domain });
      return null;
    }

    const stripped = removeUrlParams(url, AWIN_TRACKING_PARAMS);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AWIN_API_TIMEOUT_MS);

    try {
      logger.debug('Generating Awin link', { url: stripped, advertiserId });

      const response = await fetch(
        `${AWIN_API_URL}/${this.cfg.publisherId}/linkbuilder/generate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.cfg.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            advertiserId,
            destinationUrl: stripped,
            shorten: true,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        logger.warn('Awin API returned non-OK status', { status: response.status });
        return null;
      }

      const data = await response.json() as AwinLinkbuilderResponse;
      const generated = data.shortUrl ?? data.url ?? null;
      if (generated) logger.debug('Awin link generated', { url: generated });
      return generated;
    } catch (error) {
      logger.error('Failed to generate Awin link', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
