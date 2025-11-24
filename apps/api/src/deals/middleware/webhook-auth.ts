import { createMiddleware } from 'hono/factory';
import { config } from '~/config';
import { HTTP_STATUS_CODE } from '~/constants/http';
import { HttpError } from '~/utils/errors';

/**
 * Middleware para validar webhook secret
 * Equivalente à validação no Next.js: hdr !== SECRET
 */
export const webhookAuth = createMiddleware(async (c, next) => {
  const secret = c.req.header('x-webhook-secret');

  if (!secret || secret !== config.WEBHOOK_SECRET) {
    throw new HttpError(HTTP_STATUS_CODE.UNAUTHORIZED, 'Invalid webhook secret');
  }

  await next();
});
