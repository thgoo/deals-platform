/**
 * Utility functions for the Live page
 */

/**
 * Combines multiple class names, filtering out falsy values
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

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
  return new Date(dateString).toLocaleString('pt-BR');
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
 * Remove URLs from text
 */
export function removeUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, '').trim();
}
