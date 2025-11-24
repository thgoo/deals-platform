/**
 * API Configuration
 * Centralized configuration for API endpoints
 */

export const API_CONFIG = {
  // Backend API base URL (Hono server)
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',

  // Endpoints
  DEALS: '/api/deals?limit=16',
} as const;

/**
 * Get full API URL
 */
export function getApiUrl(endpoint: string): string {
  return `${API_CONFIG.BACKEND_URL}${endpoint}`;
}
