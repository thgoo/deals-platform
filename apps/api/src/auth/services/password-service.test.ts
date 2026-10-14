import { beforeEach, describe, expect, it } from 'bun:test';
import PasswordService from './password-service';

describe('PasswordService', () => {
  let passwordService: PasswordService;

  beforeEach(() => {
    passwordService = new PasswordService();
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'test-password';
      const hash = await passwordService.hashPassword(password);

      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('verifyPasswordHash', () => {
    it('should verify a correct password hash', async () => {
      const password = 'test-password';
      const hash = await passwordService.hashPassword(password);

      const result = await passwordService.verifyPasswordHash(password, hash);
      expect(result).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'test-password';
      const wrongPassword = 'wrong-password';
      const hash = await passwordService.hashPassword(password);

      const result = await passwordService.verifyPasswordHash(wrongPassword, hash);
      expect(result).toBe(false);
    });
  });
});
