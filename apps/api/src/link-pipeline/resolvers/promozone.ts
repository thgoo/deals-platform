import { logger } from '~/logger';
import { PROMOZONE_RESOLVE_API } from './constants';

const PROMOZONE_TIMEOUT_MS = 5_000;

/**
 * Promozone shortener uses a private resolve API instead of HTTP redirects.
 * Given a `go.promozone.ai/<code>` URL, this looks up the destination URL.
 * Returns the input URL on any failure (safe fallback).
 */
export async function resolvePromozoneUrl(shortUrl: string): Promise<string> {
  let shortCode: string | undefined;
  try {
    shortCode = new URL(shortUrl).pathname.split('/').filter(Boolean).pop();
  } catch {
    return shortUrl;
  }
  if (!shortCode) return shortUrl;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROMOZONE_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${PROMOZONE_RESOLVE_API}/${encodeURIComponent(shortCode)}`,
      { headers: { Accept: 'application/json' }, signal: controller.signal },
    );

    if (!response.ok) return shortUrl;

    const data = await response.json() as { destinationUrl?: string };
    if (data.destinationUrl && typeof data.destinationUrl === 'string') {
      logger.debug('Promozone URL resolved', { from: shortUrl, to: data.destinationUrl });
      return data.destinationUrl;
    }
  } catch (error) {
    logger.error('Failed to resolve Promozone URL', {
      url: shortUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  return shortUrl;
}
