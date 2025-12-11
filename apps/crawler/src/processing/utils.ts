export function calculateMessageLatency(serverTimestamp: number) {
  const serverTs = new Date(serverTimestamp * 1000);
  const receivedTs = new Date();
  const latencySeconds = (receivedTs.getTime() - serverTs.getTime()) / 1000;

  return {
    latencySeconds,
    formattedLatency: `${latencySeconds.toFixed(1)}s`,
  };
}

export function cleanUrl(url: string) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch {
    return url;
  }
}

export function removeUrlParams(url: string, params: string[]) {
  try {
    const urlObj = new URL(url);
    for (const param of params) {
      urlObj.searchParams.delete(param);
    }
    return urlObj.toString();
  } catch {
    return url;
  }
}
