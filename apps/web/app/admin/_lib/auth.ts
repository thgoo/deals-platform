import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from '@/lib/password';

// Single-operator admin auth: the password is checked against ADMIN_PASSWORD_HASH
// (scrypt, see lib/password.ts); a successful login sets an httpOnly cookie
// holding an expiry signed with ADMIN_SESSION_SECRET. Nothing is stored server
// side — rotating ADMIN_SESSION_SECRET logs every session out.

const COOKIE = 'admin_session';
const SESSION_TTL_S = 30 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'ADMIN_SESSION_SECRET must be set (at least 32 characters)',
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret())
    .update(payload)
    .digest('base64url');
}

function createToken(): string {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_S);
  return `${exp}.${sign(exp)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  const expected = Buffer.from(sign(exp));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    return false;
  return Number(exp) > Date.now() / 1000;
}

export async function isAdmin(): Promise<boolean> {
  return isValidToken((await cookies()).get(COOKIE)?.value);
}

/** For pages and layouts: sends anonymous visitors to the login page. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect('/login');
}

/**
 * For server actions. They're public POST endpoints that skip layouts, so each
 * one must check the session itself.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error('Unauthorized');
}

/** Checks the password and, if it matches, starts a session. */
export async function logIn(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !(await verifyPassword(password, hash))) return false;

  (await cookies()).set(COOKIE, createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
  return true;
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
