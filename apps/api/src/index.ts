import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import auth from '~/auth';
import PasswordService from '~/auth/services/password-service';
import SessionService from '~/auth/services/session-service';
import UserService from '~/auth/services/user-service';
import { config } from '~/config';
import deals from '~/deals/deals';
import DealService from '~/deals/services/deal-service';
import { ConsoleLogger } from '~/logger';
import { requestLogger } from '~/middleware/request-logger';
import { HttpError } from '~/utils/errors';
import { HTTP_STATUS_CODE } from './constants/http';

export function createApp({
  userService = new UserService(),
  sessionService = new SessionService(),
  passwordService = new PasswordService(),
  dealService = new DealService(),
  appLogger = new ConsoleLogger(),
  enableLogger = true,
} = {}) {
  const app = new Hono({ strict: true });

  app.use('*', cors({
    origin: config.CORS_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
  }));

  if (process.env.NODE_ENV === 'production') app.use(csrf());
  if (enableLogger) app.use(requestLogger());

  app.use('*', async (c, next) => {
    c.set('userService', userService);
    c.set('sessionService', sessionService);
    c.set('passwordService', passwordService);
    c.set('dealService', dealService);
    c.set('logger', appLogger);
    await next();
  });

  app.route('/api/auth', auth);
  app.route('/api/deals', deals);

  app.onError(async (err, c) => {
    const logger = c.get('logger');

    if (err instanceof HttpError) {
      return c.json({ message: err.message }, { status: err.statusCode });
    }

    if (err instanceof HTTPException) {
      const errMessage = await err.getResponse().text();
      return c.json({ message: errMessage }, { status: err.status });
    }

    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: c.req.path,
      method: c.req.method,
    });

    const message = config.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message;

    return c.json({ message }, { status: HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR });
  });

  return app;
}

const app = createApp();

export default {
  port: config.PORT,
  fetch: app.fetch,
  idleTimeout: 0,
};
