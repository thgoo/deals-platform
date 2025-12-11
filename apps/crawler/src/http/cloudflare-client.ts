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
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    logger.error(`CloudFlare bypass failed for ${url}`, { error: errorMessage });
    throw error;
  }
}
