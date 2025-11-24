/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
import { beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import { Hono } from 'hono';
import type { SessionValidationResult } from './types';
import type { Session } from '~/db/schemas/sessions';
import { HTTP_STATUS_CODE } from '~/constants/http';
import { createApp } from '~/index';

describe('Auth Routes', () => {
  let app: Hono;
  let mockUserService: {
    getUserByEmail: Mock<any>;
    userExists: Mock<any>;
    createUser: Mock<any>;
  };
  let mockSessionService: {
    generateSessionToken: Mock<any>;
    createSession: Mock<any>;
    setSessionTokenCookie: Mock<any>;
    validateSessionToken: Mock<any>;
    invalidateSession: Mock<any>;
    deleteSessionTokenCookie: Mock<any>;
    getSessionIdFromToken: Mock<any>;
  };
  let mockPasswordService: {
    hashPassword: Mock<any>;
    verifyPasswordHash: Mock<any>;
    verifyPasswordStrength: Mock<any>;
  };

  beforeEach(() => {
    mockUserService = {
      getUserByEmail: mock(() => {}),
      userExists: mock(() => {}),
      createUser: mock(() => {}),
    };

    mockSessionService = {
      generateSessionToken: mock<() => string>(),
      createSession: mock<(token: string, userId: number) => Promise<Session>>(),
      setSessionTokenCookie: mock<(response: Response, token: string, expiresAt?: Date) => void>(),
      validateSessionToken: mock<(token: string) => Promise<SessionValidationResult>>(),
      invalidateSession: mock<(sessionId: string) => Promise<void>>(),
      deleteSessionTokenCookie: mock<(response: Response) => void>(),
      getSessionIdFromToken: mock<(token: string) => Promise<string | null>>(),
    };

    mockPasswordService = {
      hashPassword: mock(() => {}),
      verifyPasswordHash: mock(() => {}),
      verifyPasswordStrength: mock(() => {}),
    };

    app = createApp({
      userService: mockUserService,
      sessionService: mockSessionService as any,
      passwordService: mockPasswordService,
      enableLogger: false,
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 204 No Content on successful login', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const userId = 'user-id-123';
      const sessionToken = 'session-token-abc';

      mockUserService.getUserByEmail.mockResolvedValue({ id: userId, email, password: 'hashedPassword123' });
      mockPasswordService.verifyPasswordHash.mockResolvedValue(true);
      mockSessionService.generateSessionToken.mockReturnValue(sessionToken);
      mockSessionService.createSession.mockResolvedValue(undefined);
      mockSessionService.setSessionTokenCookie.mockReturnValue(undefined);

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      expect(res.status).toBe(HTTP_STATUS_CODE.NO_CONTENT);
      expect(mockUserService.getUserByEmail).toHaveBeenCalledWith(email);
      expect(mockPasswordService.verifyPasswordHash).toHaveBeenCalledWith(password, 'hashedPassword123');
      expect(mockSessionService.generateSessionToken).toHaveBeenCalled();
      expect(mockSessionService.createSession).toHaveBeenCalledWith(sessionToken, userId);
      expect(mockSessionService.setSessionTokenCookie).toHaveBeenCalled();
    });

    it('should return 401 Unauthorized for invalid credentials', async () => {
      const email = 'test@example.com';
      const password = 'wrong-password';

      mockUserService.getUserByEmail.mockResolvedValue(null);
      mockPasswordService.verifyPasswordHash.mockResolvedValue(false);

      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      expect(res.status).toBe(HTTP_STATUS_CODE.UNAUTHORIZED);
      const body: any = await res.json();
      expect(body.message).toBe('Invalid credentials');
    });

    it('should return 400 Bad Request for invalid input', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email', password: '123' }),
      });

      expect(res.status).toBe(HTTP_STATUS_CODE.BAD_REQUEST);
      const body: any = await res.json();
      expect(body.message).toBe('Invalid email');
    });
  });
});
