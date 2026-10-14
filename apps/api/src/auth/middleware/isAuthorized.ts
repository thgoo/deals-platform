import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Session } from '~/db/schemas/sessions';
import type { User } from '~/db/schemas/users';
import { HTTP_STATUS_CODE } from '~/constants/http';

export const isAuthorized = createMiddleware<{
  Variables: {
    session: Session;
    token: string;
    user: User;
  }
}>(async (c, next) => {
  const sessionService = c.get('sessionService');
  const token = getCookie(c, 'session');

  if (!token) return c.json({ message: 'Unauthorized' }, HTTP_STATUS_CODE.UNAUTHORIZED);

  const { session, user } = await sessionService.validateSessionToken(token);

  if (!session) {
    sessionService.deleteSessionTokenCookie(c.res);
    return c.json({ message: 'Unauthorized' }, HTTP_STATUS_CODE.UNAUTHORIZED);
  }

  c.set('session', session);
  c.set('token', token);
  c.set('user', user);
  await next();
});
