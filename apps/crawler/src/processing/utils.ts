/**
 * Utility functions for message processing
 */

/**
 * Calculate latency between message server timestamp and received timestamp
 * @param serverTimestamp Unix timestamp in seconds from the message
 * @returns Latency in seconds and formatted latency string
 */
export function calculateMessageLatency(serverTimestamp: number): {
  latencySeconds: number;
  formattedLatency: string;
} {
  const serverTs = new Date(serverTimestamp * 1000);
  const receivedTs = new Date();
  const latencySeconds = (receivedTs.getTime() - serverTs.getTime()) / 1000;

  return {
    latencySeconds,
    formattedLatency: `${latencySeconds.toFixed(1)}s`,
  };
}

/**
 * Removes all query parameters and hash fragments from a URL
 * @param url The URL to clean
 * @returns The cleaned URL with only protocol, host, and pathname
 */
export function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and hash by reconstructing the URL
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    // If URL parsing fails, return the original
    return url;
  }
}
