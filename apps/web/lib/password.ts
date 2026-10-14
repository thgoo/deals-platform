import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt parameters (N=2^15, r=8, p=1, 64-byte key): ~100 ms per check, which
// is the point — it makes guessing the admin password slow.
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N, r: R, p: P, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/**
 * `scrypt:<salt base64>:<hash base64>` — the format ADMIN_PASSWORD_HASH holds.
 * (No `$`: Next.js expands `$NAME` inside .env values.)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split(':');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
