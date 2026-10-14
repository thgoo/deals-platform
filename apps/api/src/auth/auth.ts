import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { NewUser } from '~/db/schemas/users';
import { HTTP_STATUS_CODE } from '~/constants/http';
import { HttpError } from '~/utils/errors';
import { isAuthorized } from './middleware/isAuthorized';
import { isGuest } from './middleware/isGuest';
import { userLoginSchema, userRegisterSchema } from './schemas';

const app = new Hono();

app.post(
  '/register',
  validator('json', value => {
    const parsed = userRegisterSchema.safeParse(value);
    if (!parsed.success) {
      throw new HttpError(HTTP_STATUS_CODE.BAD_REQUEST, parsed.error.issues[0].message);
    }
    return parsed.data;
  }),
  isGuest,
  async c => {
    const userService = c.get('userService');
    const passwordService = c.get('passwordService');
    const sessionService = c.get('sessionService');

    const body = c.req.valid('json');
    const userExists = await userService.userExists(body.email);

    if (userExists) {
      throw new HttpError(HTTP_STATUS_CODE.BAD_REQUEST, 'Email already in use');
    }

    const hashedPassword = await passwordService.hashPassword(body.password);
    const user: NewUser = {
      name: body.name,
      document: body.document,
      email: body.email,
      password: hashedPassword,
    };

    const storedIds = await userService.createUser(user);
    const token = sessionService.generateSessionToken();

    await sessionService.createSession(token, storedIds[0].id);
    sessionService.setSessionTokenCookie(
      c.res,
      token,
    );

    return c.json(null, HTTP_STATUS_CODE.CREATED);
  })
  .post(
    '/login',
    validator('json', value => {
      const parsed = userLoginSchema.safeParse(value);
      if (!parsed.success) {
        throw new HttpError(HTTP_STATUS_CODE.BAD_REQUEST, parsed.error.issues[0].message);
      }
      return parsed.data;
    }),
    isGuest,
    async c => {
      const userService = c.get('userService');
      const passwordService = c.get('passwordService');
      const sessionService = c.get('sessionService');

      const body = c.req.valid('json');
      const user = await userService.getUserByEmail(body.email);
      const passwordIsValid = await passwordService.verifyPasswordHash(
        body.password,
        user?.password,
      );

      if (!passwordIsValid) {
        throw new HttpError(HTTP_STATUS_CODE.UNAUTHORIZED, 'Invalid credentials');
      }

      const token = sessionService.generateSessionToken();
      await sessionService.createSession(token, user.id);
      sessionService.setSessionTokenCookie(c.res, token);

      return c.body(null, HTTP_STATUS_CODE.NO_CONTENT);
    })
  .get('/me', isAuthorized, async c => {
    const sessionService = c.get('sessionService');
    const { session, token, user } = c.var;

    if (!session) {
      sessionService.deleteSessionTokenCookie(c.res);
      throw new HttpError(HTTP_STATUS_CODE.UNAUTHORIZED, 'Unauthorized');
    }

    sessionService.setSessionTokenCookie(c.res, token, session.expiresAt);

    return c.json({ user }, HTTP_STATUS_CODE.OK);
  })
  .post('/logout', isAuthorized, async c => {
    const sessionService = c.get('sessionService');
    const { session } = c.var;

    if (!session) {
      sessionService.deleteSessionTokenCookie(c.res);
      throw new HttpError(HTTP_STATUS_CODE.UNAUTHORIZED, 'Failed to log out');
    }

    await sessionService.invalidateSession(session.id);
    sessionService.deleteSessionTokenCookie(c.res);

    return c.body(null, HTTP_STATUS_CODE.NO_CONTENT);
  });

export default app;
