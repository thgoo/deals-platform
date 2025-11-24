import { beforeEach, describe, expect, it, mock } from 'bun:test';
import db from '~/db';
import { usersTable } from '~/db/schemas/users';
import UserService from './user-service';

mock.module('~/db', () => {
  return {
    default: {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => Promise.resolve([])),
        })),
      })),
      insert: mock(() => ({
        values: mock(() => ({
          $returningId: mock(() => Promise.resolve([{ id: 1 }])),
        })),
      })),
    },
  };
});

describe('UserService', () => {
  let userService: UserService;
  let mockDb: unknown;

  beforeEach(() => {
    userService = new UserService();
    mockDb = db;
  });

  describe('userExists', () => {
    it('should return false when user does not exist', async () => {
      const mockWhere = mock(() => Promise.resolve([]));
      const mockFrom = mock(() => ({ where: mockWhere }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await userService.userExists('nonexistent@example.com');
      expect(result).toBe(false);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(usersTable);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return true when user exists', async () => {
      const mockWhere = mock(() => Promise.resolve([{ id: 1, email: 'existing@example.com' }]));
      const mockFrom = mock(() => ({ where: mockWhere }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await userService.userExists('existing@example.com');
      expect(result).toBe(true);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(usersTable);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getUserByEmail', () => {
    it('should return null when user does not exist', async () => {
      const mockWhere = mock(() => Promise.resolve([]));
      const mockFrom = mock(() => ({ where: mockWhere }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await userService.getUserByEmail('nonexistent@example.com');
      expect(result).toBeNull();
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(usersTable);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should return user when found', async () => {
      const mockUser = {
        id: 1,
        name: 'Test User',
        document: '12345678900',
        email: 'existing@example.com',
        password: 'hashed_password',
      };
      const mockWhere = mock(() => Promise.resolve([mockUser]));
      const mockFrom = mock(() => ({ where: mockWhere }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await userService.getUserByEmail('existing@example.com');
      expect(result).toEqual(mockUser);
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(usersTable);
      expect(mockWhere).toHaveBeenCalled();
    });

    it('should throw an error when database query fails', async () => {
      const mockWhere = mock(() => Promise.reject(new Error('Database error')));
      const mockFrom = mock(() => ({ where: mockWhere }));
      const mockSelect = mock(() => ({ from: mockFrom }));
      (mockDb as any).select = mockSelect; // eslint-disable-line @typescript-eslint/no-explicit-any

      await expect(userService.getUserByEmail('test@example.com'))
        .rejects
        .toThrow('Database error');
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(usersTable);
      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    it('should create a user and return the id', async () => {
      const newUser = {
        name: 'New User',
        document: '98765432100',
        email: 'new@example.com',
        password: 'hashed_password',
      };
      const mockReturningId = mock(() => Promise.resolve([{ id: 1 }]));
      const mockValues = mock(() => ({ $returningId: mockReturningId }));
      const mockInsert = mock(() => ({ values: mockValues }));
      (mockDb as any).insert = mockInsert; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await userService.createUser(newUser);
      expect(result).toEqual([{ id: 1 }]);
      expect(mockInsert).toHaveBeenCalledWith(usersTable);
      expect(mockValues).toHaveBeenCalledWith(newUser);
      expect(mockReturningId).toHaveBeenCalled();
    });
  });
});
