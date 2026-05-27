import { createMiddleware } from 'hono/factory';
import { config } from '~/config';
import { HTTP_STATUS_CODE } from '~/constants/http';

/**
 * Header-based auth for /api/dashboard/*. Compares `X-Dashboard-Secret` against
 * the env var using a constant-time check to avoid leaking length / prefix
 * information to timing attacks. Returns plain 404 (not 401) so a probing bot
 * sees the endpoints as nonexistent.
 */
export const dashboardAuth = createMiddleware(async (c, next) => {
  const presented = c.req.header('X-Dashboard-Secret') ?? '';
  if (!secureCompare(presented, config.DASHBOARD_SECRET)) {
    return c.json({ message: 'Not Found' }, HTTP_STATUS_CODE.NOT_FOUND);
  }
  await next();
});

function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
