export function calculateMessageLatency(serverTimestamp: number) {
  const serverTs = new Date(serverTimestamp * 1000);
  const receivedTs = new Date();
  const latencySeconds = (receivedTs.getTime() - serverTs.getTime()) / 1000;

  return {
    latencySeconds,
    formattedLatency: `${latencySeconds.toFixed(1)}s`,
  };
}
