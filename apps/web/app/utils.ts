/**
 * Format price in BRL currency
 */
export function formatPrice(priceInCents: number): string {
  return (priceInCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Format date/time for display
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('pt-BR').replace(',', ' às');
}

/**
 * Format time only
 */
export function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Extract filename from path
 */
export function getFilename(path: string): string {
  return path.split('/').pop() || '';
}

/**
 * Format relative time (e.g., "há 2h", "há 30m")
 */
export function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'agora';
  if (diffMins < 60) return `há ${diffMins}m`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays < 7) return `há ${diffDays}d`;

  return new Date(dateString).toLocaleDateString('pt-BR');
}

/**
 * Remove URLs from text
 */
export function removeUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, '').trim();
}

/**
 * Returns the image src URL for a deal's localPath.
 * - Paths starting with "media/" are dynamic images downloaded from Telegram,
 *   served through the /api/media route.
 * - Other paths are static app assets (e.g. coupon.png) served from /images/.
 */
export function getDealImageSrc(localPath: string | undefined | null): string | null {
  if (!localPath) return null;
  return localPath.startsWith('media/')
    ? `/api/media?file=${localPath}`
    : `/images/${localPath}`;
}
