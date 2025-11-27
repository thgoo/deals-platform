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
