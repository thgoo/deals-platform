import { AFFILIATE_NETWORK_DOMAINS, HTTP_HEADERS, REQUEST_TIMEOUT_MS } from './constants';

const NETWORK_TIMEOUT_MS = 5_000;

export function isAffiliateNetworkUrl(url: string): boolean {
  return AFFILIATE_NETWORK_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Unwraps an affiliate network URL (Awin, etc.) to find the real destination.
 * - Awin embeds the destination in the `ued` query param — read it directly without HTTP.
 * - Other networks fall back to following the redirect chain.
 *
 * Returns null when the destination cannot be resolved.
 */
export async function followAffiliateNetwork(networkUrl: string): Promise<string | null> {
  let urlObj: URL;
  try {
    urlObj = new URL(networkUrl);
  } catch {
    return null;
  }

  if (networkUrl.includes('awin')) {
    const ued = urlObj.searchParams.get('ued');
    if (ued) return decodeURIComponent(ued);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

  try {
    const response = await fetch(networkUrl, {
      method: 'GET',
      headers: HTTP_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    const finalUrl = response.url;
    return finalUrl && finalUrl !== networkUrl ? finalUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export { REQUEST_TIMEOUT_MS };
