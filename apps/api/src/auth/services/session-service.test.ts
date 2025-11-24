import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { SESSION_DURATION_MS, SESSION_RENEWAL_THRESHOLD_MS } from '~/constants/session';
import db from '~/db';
import { sessionsTable } from '~/db/schemas/sessions';
import SessionService from './session-service';

mock.module('~/db', () => {
  return {
    default: {
      select: mock(() => ({
        from: mock(() => ({
          innerJoin: mock(() => ({
            where: mock(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => Promise.resolve()),
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve()),
        })),
      })),
      delete: mock(() => ({
        where: mock(() => Promise.resolve()),
      })),
    },
  };
});

describe('SessionService', () => {
  let sessionService: SessionService;
  let mockDb: unknown;

  beforeEach(() => {
    sessionService = new SessionService();
    mockDb = db;
  });

  describe('generateSessionToken', () => {
    it('should generate a random token', () => {
      const token1 = sessionService.generateSessionToken();
      const token2 = sessionService.generateSessionToken();

      expect(typeof token1).toBe('string');
      expect(token1.length).toBeGreaterThan(0);
      expect(token1).not.toBe(token2);
    });
  });

  describe('createSession', () => {
    it('should create a session in the database', async () => {
      const token = 'test-token';
      const userId = 1;

      const mockValues = mock(() => Promise.resolve());
      const mockInsert = mock(() => ({ values: mockValues }));
      (mockDb as any).insert = mockInsert; // eslint-disable-line @typescript-eslint/no-explicit-any

      const session = await sessionService.createSession(token, userId);

      expect(mockInsert).toHaveBeenCalledWith(sessionsTable);
      expect(mockValues).toHaveBeenCalled();
      expect(session.userId).toBe(userId);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should set expiration to SESSION_DURATION_MS', async () => {
      const token = 'test-token';
      const userId = 1;
      const beforeCreate = Date.now();

      const mockValues = mock(() => Promise.resolve());
      const mockInsert = mock(() => ({ values: mockValues }));
      (mockDb as any).insert = mockInsert; // eslint-disable-line @typescript-eslint/no-explicit-any

      const session = await sessionService.createSession(token, userId);
      const afterCreate = Date.now();

      const expectedMin = beforeCreate + SESSION_DURATION_MS;
      const expectedMax = afterCreate + SESSION_DURATION_MS;

      expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(session.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('setSessionTokenCookie', () => {
    it('should set cookie with correct attributes', () => {
      const response = new Response();
      const token = 'test-token';

      sessionService.setSessionTokenCookie(response, token);

      const cookie = response.headers.get('Set-Cookie');
      expect(cookie).toContain('session=test-token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Expires=');
    });

    it('should use custom expiresAt if provided', () => {
      const response = new Response();
      const token = 'test-token';
      const customExpires = new Date('2030-01-01T00:00:00Z');

      sessionService.setSessionTokenCookie(response, token, customExpires);

      const cookie = response.headers.get('Set-Cookie');
      expect(cookie).toContain('Expires=Tue, 01 Jan 2030 00:00:00 GMT');
    });
  });

  describe('validateSessionToken', () => {
    it('should return null for non-existent session', async () => {
      const token = 'invalid-token';

      const mockWhere = mock(() => Promise.resolve([]));
      const mockInnerJoin = mock(() => ({ where: mockWhere }));
      const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await sessionService.validateSessionToken(token);

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
    });

    it('should return null and delete expired session', async () => {
      const token = 'expired-token';
      const expiredSession = {
        id: 'session-id',
        userId: 1,
        expiresAt: new Date(Date.now() - 1000),
      };
      const user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        document: '12345678900',
        password: 'hashed',
      };

      const mockWhere = mock(() => Promise.resolve([{ session: expiredSession, user }]));
      const mockInnerJoin = mock(() => ({ where: mockWhere }));
      const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const mockDeleteWhere = mock(() => Promise.resolve());
      const mockDelete = mock(() => ({ where: mockDeleteWhere }));
      (mockDb as any).delete = mockDelete; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await sessionService.validateSessionToken(token);

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
      expect(mockDelete).toHaveBeenCalledWith(sessionsTable);
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it('should return session and user for valid session', async () => {
      const token = 'valid-token';
      const validSession = {
        id: 'session-id',
        userId: 1,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      };
      const user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        document: '12345678900',
        password: 'hashed',
      };

      const mockWhere = mock(() => Promise.resolve([{ session: validSession, user }]));
      const mockInnerJoin = mock(() => ({ where: mockWhere }));
      const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await sessionService.validateSessionToken(token);

      expect(result.session).toEqual(validSession);
      expect(result.user).toEqual(user);
    });

    it('should renew session when close to expiration', async () => {
      const token = 'renew-token';
      const almostExpiredSession = {
        id: 'session-id',
        userId: 1,
        expiresAt: new Date(Date.now() + SESSION_RENEWAL_THRESHOLD_MS - 1000),
      };
      const user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        document: '12345678900',
        password: 'hashed',
      };

      const mockWhere = mock(() => Promise.resolve([{ session: almostExpiredSession, user }]));
      const mockInnerJoin = mock(() => ({ where: mockWhere }));
      const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const mockUpdateWhere = mock(() => Promise.resolve());
      const mockSet = mock(() => ({ where: mockUpdateWhere }));
      const mockUpdate = mock(() => ({ set: mockSet }));
      (mockDb as any).update = mockUpdate; // eslint-disable-line @typescript-eslint/no-explicit-any

      const beforeValidation = Date.now();
      const result = await sessionService.validateSessionToken(token);
      const afterValidation = Date.now();

      expect(result.session).not.toBeNull();
      expect(result.user).toEqual(user);
      expect(mockUpdate).toHaveBeenCalledWith(sessionsTable);
      expect(mockSet).toHaveBeenCalled();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const renewedExpiration = result.session!.expiresAt.getTime();
      expect(renewedExpiration).toBeGreaterThanOrEqual(beforeValidation + SESSION_DURATION_MS);
      expect(renewedExpiration).toBeLessThanOrEqual(afterValidation + SESSION_DURATION_MS);
    });

    it('should not renew session when not close to expiration', async () => {
      const token = 'fresh-token';
      const freshSession = {
        id: 'session-id',
        userId: 1,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      };
      const user = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        document: '12345678900',
        password: 'hashed',
      };

      const mockWhere = mock(() => Promise.resolve([{ session: freshSession, user }]));
      const mockInnerJoin = mock(() => ({ where: mockWhere }));
      const mockFrom = mock(() => ({ innerJoin: mockInnerJoin }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const mockUpdateWhere = mock(() => Promise.resolve());
      const mockSet = mock(() => ({ where: mockUpdateWhere }));
      const mockUpdate = mock(() => ({ set: mockSet }));
      (mockDb as any).update = mockUpdate; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await sessionService.validateSessionToken(token);

      expect(result.session).toEqual(freshSession);
      expect(result.user).toEqual(user);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('invalidateSession', () => {
    it('should delete session from database', async () => {
      const sessionId = 'session-to-delete';

      const mockWhere = mock(() => Promise.resolve());
      const mockDelete = mock(() => ({ where: mockWhere }));
      (mockDb as any).delete = mockDelete; // eslint-disable-line @typescript-eslint/no-explicit-any

      await sessionService.invalidateSession(sessionId);

      expect(mockDelete).toHaveBeenCalledWith(sessionsTable);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('deleteSessionTokenCookie', () => {
    it('should set expired cookie with correct attributes', () => {
      const response = new Response();

      sessionService.deleteSessionTokenCookie(response);

      const cookie = response.headers.get('Set-Cookie');
      expect(cookie).toContain('session=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
    });
  });
});
