import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { HTTP_STATUS_CODE } from '~/constants/http';

export const isGuest: MiddlewareHandler = async (c, next) => {
  const sessionService = c.get('sessionService');
  const token = getCookie(c, 'session');

  if (token) {
    const { session } = await sessionService.validateSessionToken(token);

    if (session) return c.json({ message: 'Already logged in' }, HTTP_STATUS_CODE.FORBIDDEN);
  }

  await next();
};
