import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password-hasher';

it('produces verifiable password hashes within the Workers PBKDF2 iteration budget', async () => {
  const password = 'a secure password';

  const passwordHash = await hashPassword(password);
  const [iterations] = passwordHash.split('.');

  expect(Number(iterations)).toBe(100_000);
  expect(await verifyPassword(password, passwordHash)).toBe(true);
  expect(await verifyPassword('a different password', passwordHash)).toBe(false);
});
