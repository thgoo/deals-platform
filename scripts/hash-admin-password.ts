// Prints the ADMIN_PASSWORD_HASH value for apps/web/.env* (admin login at /login).
//
//   bun scripts/hash-admin-password.ts 'my long password'
//
// Prefer a long passphrase: it's the only thing protecting the admin dashboard.

import { hashPassword } from '../apps/web/lib/password';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: bun scripts/hash-admin-password.ts <password of 12+ characters>');
  process.exit(1);
}
console.log(await hashPassword(password));
