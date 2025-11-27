import CloudScraper from 'cloudscraper.js';
import { logger } from '../logger';

export interface CloudflareResponse {
  status: number;
  data: string;
  headers: Record<string, string>;
}

const scraper = new CloudScraper({
  usePython3: true,
  timeoutInSeconds: 15,
});

/**
 * HTTP client that bypasses CloudFlare protection
 */
export async function fetchWithCloudflareBypass(url: string): Promise<CloudflareResponse> {
  try {
    logger.debug(`Fetching URL with CloudFlare bypass: ${url}`);

    const response = await scraper.get(url);

    logger.debug(`CloudFlare bypass successful for ${url}, status: ${response.status}`);

    return {
      status: response.status,
      data: response.text(),
      headers: (typeof response.headers === 'object' ? response.headers : {}) as Record<string, string>,
    };
  } catch (error) {
    logger.error(`CloudFlare bypass failed for ${url}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
