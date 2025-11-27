import cloudscraper from 'cloudscraper';
import { logger } from '../logger';

export interface CloudflareResponse {
  status: number;
  data: string;
  headers: Record<string, string>;
}

/**
 * HTTP client that bypasses CloudFlare protection
 */
export async function fetchWithCloudflareBypass(url: string): Promise<CloudflareResponse> {
  try {
    logger.debug(`Fetching URL with CloudFlare bypass: ${url}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (cloudscraper as any)(url, {
      timeout: 15000,
    });

    logger.debug(`CloudFlare bypass successful for ${url}`);

    return {
      status: 200,
      data: response,
      headers: {},
    };
  } catch (error) {
    logger.error(`CloudFlare bypass failed for ${url}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
