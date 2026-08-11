import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import type { Env as WorkerEnv } from '../src/env';
import type { EmailMessage, EmailSender, InvitationEmailMessage } from '../src/email/email-sender';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  failure: Error | null = null;
  async send(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.messages.push(message);
  }
  async sendInvitation(message: InvitationEmailMessage): Promise<void> {
    await this.send({ to: message.to, subject: `Invitación a ${message.householdName}`, text: `Te han invitado a ${message.householdName}. Acepta: ${message.url}` });
  }
}

const fakeEmailSender = new FakeEmailSender();
const worker = createWorker(fakeEmailSender);
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, first_name TEXT NULL, last_name TEXT NULL, birth_date TEXT NULL, username TEXT UNIQUE COLLATE NOCASE NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, otp_hash TEXT NULL UNIQUE, otp_attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_name TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL);
    DELETE FROM refresh_tokens;
    DELETE FROM auth_tokens;
    DELETE FROM users;
  `);
  fakeEmailSender.messages = [];
  fakeEmailSender.failure = null;
});

it('does not allow an unverified user to log in', async () => {
  const email = `unverified-${crypto.randomUUID()}@example.test`;

  const registerResponse = await dispatch('/v1/auth/register', { name: 'Ana', email, password: 'a secure password' });
  expect(registerResponse.status).toBe(201);

  const response = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' });

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
});

it('sends a verifiable email and creates a web session for a verified user', async () => {
  const email = `web-${crypto.randomUUID()}@example.test`;
  const registerResponse = await dispatch('/v1/auth/register', { name: 'Bea', email, password: 'a secure password' });
  expect(registerResponse.status).toBe(201);
  expect(fakeEmailSender.messages).toHaveLength(1);
  expect(fakeEmailSender.messages[0]).toMatchObject({ to: email, subject: 'Verifica tu correo de NFCompra' });
  expect(fakeEmailSender.messages[0].text).toContain('http://app.test/auth/verify?token=');
  const verifyResponse = await dispatch('/v1/auth/verify-email', { token: tokenFrom(fakeEmailSender.messages[0]) });
  expect(verifyResponse.status).toBe(200);

  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'web' });
  expect(loginResponse.status).toBe(200);
  expect(loginResponse.headers.get('set-cookie')).toMatch(/^refresh_token=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/v1\/auth; Max-Age=2592000$/);
  const { accessToken } = await loginResponse.json<{ accessToken: string }>();

  const meResponse = await dispatch('/v1/me', undefined, { authorization: `Bearer ${accessToken}` }, 'GET');
  expect(meResponse.status).toBe(200);
  expect(await meResponse.json()).toMatchObject({ user: { name: 'Bea', email } });

  const updateResponse = await dispatch('/v1/me', { name: 'Beatriz' }, { authorization: `Bearer ${accessToken}` }, 'PATCH');
  expect(updateResponse.status).toBe(200);
  expect(await updateResponse.json()).toMatchObject({ user: { name: 'Beatriz' } });
});

it('updates authenticated profile fields partially', async () => {
  const email = `profile-update-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'web' });
  const { accessToken } = await loginResponse.json<{ accessToken: string }>();

  const firstNameResponse = await dispatch('/v1/me', { firstName: 'Esteban' }, { authorization: `Bearer ${accessToken}` }, 'PATCH');
  expect(firstNameResponse.status).toBe(200);
  expect(await firstNameResponse.json()).toMatchObject({ user: { firstName: 'Esteban', name: 'Esteban', email } });

  const usernameResponse = await dispatch('/v1/me', { username: 'esteban.gp' }, { authorization: `Bearer ${accessToken}` }, 'PATCH');
  expect(usernameResponse.status).toBe(200);
  expect(await usernameResponse.json()).toMatchObject({ user: { username: 'esteban.gp', firstName: 'Esteban' } });
});

it('rejects profile username conflicts and invalid input', async () => {
  const firstEmail = `profile-first-${crypto.randomUUID()}@example.test`;
  const secondEmail = `profile-second-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(firstEmail);
  await dispatch('/v1/me', { username: 'taken-user' }, await authHeaders(firstEmail), 'PATCH');
  await registerAndVerify(secondEmail);
  const headers = await authHeaders(secondEmail);

  const conflict = await dispatch('/v1/me', { username: 'TAKEN-user' }, headers, 'PATCH');
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: { code: 'USERNAME_ALREADY_REGISTERED', message: 'Ese nombre de usuario ya esta en uso.' } });

  const invalidName = await dispatch('/v1/me', { firstName: '' }, headers, 'PATCH');
  expect(invalidName.status).toBe(422);
  const invalidUsername = await dispatch('/v1/me', { username: 'no vale' }, headers, 'PATCH');
  expect(invalidUsername.status).toBe(422);
});

it('changes password for the authenticated user without invalidating the current access token', async () => {
  const email = `change-password-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' });
  const login = await loginResponse.json<{ accessToken: string; refreshToken: string }>();

  const wrongCurrent = await dispatch('/v1/me/change-password', { currentPassword: 'wrong password', newPassword: 'a better password' }, { authorization: `Bearer ${login.accessToken}` });
  expect(wrongCurrent.status).toBe(401);
  expect(await wrongCurrent.json()).toMatchObject({ error: { code: 'INVALID_CURRENT_PASSWORD' } });

  const invalidNew = await dispatch('/v1/me/change-password', { currentPassword: 'a secure password', newPassword: 'short' }, { authorization: `Bearer ${login.accessToken}` });
  expect(invalidNew.status).toBe(422);

  const changed = await dispatch('/v1/me/change-password', { currentPassword: 'a secure password', newPassword: 'a better password' }, { authorization: `Bearer ${login.accessToken}` });
  expect(changed.status).toBe(200);
  expect(await changed.json()).toEqual({ status: 'password_changed' });

  const oldLogin = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' });
  expect(oldLogin.status).toBe(401);
  const newLogin = await dispatch('/v1/auth/login', { email, password: 'a better password', clientType: 'android' });
  expect(newLogin.status).toBe(200);
  const stillAuthenticated = await dispatch('/v1/me', undefined, { authorization: `Bearer ${login.accessToken}` }, 'GET');
  expect(stillAuthenticated.status).toBe(200);
});

it('rejects unauthenticated password change', async () => {
  const response = await dispatch('/v1/me/change-password', { currentPassword: 'a secure password', newPassword: 'a better password' });
  expect(response.status).toBe(401);
});

it('registers the extended profile fields used by the web form', async () => {
  const email = `profile-${crypto.randomUUID()}@example.test`;

  const registerResponse = await dispatch('/v1/auth/register', {
    firstName: 'Esteban',
    lastName: 'García Pérez',
    birthDate: '1995-04-23',
    username: 'Spee',
    email,
    password: 'a secure password',
  });

  expect(registerResponse.status).toBe(201);
  expect(await registerResponse.json()).toMatchObject({
    user: {
      name: 'Esteban García Pérez',
      firstName: 'Esteban',
      lastName: 'García Pérez',
      birthDate: '1995-04-23',
      username: 'Spee',
      email,
    },
  });

  const duplicateUsername = await dispatch('/v1/auth/register', {
    firstName: 'Otra',
    lastName: 'Persona',
    birthDate: '1990-01-01',
    username: 'spee',
    email: `profile-duplicate-${crypto.randomUUID()}@example.test`,
    password: 'a secure password',
  });
  expect(duplicateUsername.status).toBe(409);
  expect(await duplicateUsername.json()).toMatchObject({ error: { code: 'USERNAME_ALREADY_REGISTERED' } });
});

it('returns a recoverable JSON error when registration email fails and supports resending it', async () => {
  const email = `recoverable-${crypto.randomUUID()}@example.test`;
  fakeEmailSender.failure = new Error('provider unavailable');

  const failedRegistration = await dispatch('/v1/auth/register', { name: 'Bea', email, password: 'a secure password' });

  expect(failedRegistration.status).toBe(503);
  expect(failedRegistration.headers.get('content-type')).toContain('application/json');
  expect(await failedRegistration.json()).toEqual({
    error: {
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'No se pudo enviar el correo de verificación.',
      details: { retryPath: '/v1/auth/resend-verification' },
    },
  });

  fakeEmailSender.failure = null;
  const resent = await dispatch('/v1/auth/resend-verification', { email });
  expect(resent.status).toBe(202);
  expect(await resent.json()).toEqual({ status: 'accepted' });
  expect(fakeEmailSender.messages).toHaveLength(1);
  expect(fakeEmailSender.messages[0]).toMatchObject({ to: email, subject: 'Verifica tu correo de NFCompra' });

  const verified = await dispatch('/v1/auth/verify-email', { token: tokenFrom(fakeEmailSender.messages[0]) });
  expect(verified.status).toBe(200);
});

it('does not reveal account state when resending verification and email delivery fails', async () => {
  const pendingEmail = `pending-${crypto.randomUUID()}@example.test`;
  const verifiedEmail = `verified-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(verifiedEmail);
  await dispatch('/v1/auth/register', { name: 'Pendiente', email: pendingEmail, password: 'a secure password' });
  fakeEmailSender.failure = new Error('provider unavailable');

  const responses = await Promise.all([
    dispatch('/v1/auth/resend-verification', { email: pendingEmail }),
    dispatch('/v1/auth/resend-verification', { email: verifiedEmail }),
    dispatch('/v1/auth/resend-verification', { email: `missing-${crypto.randomUUID()}@example.test` }),
  ]);

  expect(responses.map((response) => response.status)).toEqual([202, 202, 202]);
  expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
    { status: 'accepted' },
    { status: 'accepted' },
    { status: 'accepted' },
  ]);

  fakeEmailSender.failure = null;
  const retry = await dispatch('/v1/auth/resend-verification', { email: pendingEmail });
  expect(retry.status).toBe(202);
  expect(fakeEmailSender.messages.at(-1)).toMatchObject({ to: pendingEmail });
});

it('rotates and revokes Android refresh tokens', async () => {
  const email = `android-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android', deviceName: 'Pixel' });
  const login = await loginResponse.json<{ accessToken: string; refreshToken: string }>();
  expect(loginResponse.status).toBe(200);
  expect(login.accessToken).toEqual(expect.any(String));
  expect(login.refreshToken).toEqual(expect.any(String));

  const refreshResponse = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: login.refreshToken });
  const refreshed = await refreshResponse.json<{ refreshToken: string }>();
  expect(refreshResponse.status).toBe(200);
  expect(refreshed.refreshToken).not.toBe(login.refreshToken);

  const oldTokenResponse = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: login.refreshToken });
  expect(oldTokenResponse.status).toBe(401);

  const logoutResponse = await dispatch('/v1/auth/logout', { clientType: 'android', refreshToken: refreshed.refreshToken });
  expect(logoutResponse.status).toBe(200);
  const revokedResponse = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: refreshed.refreshToken });
  expect(revokedResponse.status).toBe(401);
});

it('consumes a refresh token only once when requests race', async () => {
  const email = `race-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const login = await (await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' })).json<{ refreshToken: string }>();

  const responses = await Promise.all([
    dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: login.refreshToken }),
    dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: login.refreshToken }),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
});

it('does not refresh a session invalidated during password reset', async () => {
  const email = `invalidated-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const login = await (await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' })).json<{ refreshToken: string }>();
  await env.DB.prepare('UPDATE users SET session_version = session_version + 1 WHERE email = ?').bind(email).run();

  const response = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: login.refreshToken });
  expect(response.status).toBe(401);
});

it('sends a reset link and accepts the replacement password once', async () => {
  const email = `reset-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const previousSession = await (await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android' })).json<{ accessToken: string; refreshToken: string }>();
  const secondPreviousSession = await (await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android', deviceName: 'Tablet' })).json<{ refreshToken: string }>();
  const forgottenResponse = await dispatch('/v1/auth/forgot-password', { email });
  expect(forgottenResponse.status).toBe(202);
  expect(fakeEmailSender.messages).toHaveLength(2);
  expect(fakeEmailSender.messages[1]).toMatchObject({ to: email, subject: 'Restablece tu contraseña de NFCompra' });
  expect(fakeEmailSender.messages[1].text).toContain('http://app.test/auth/reset-password?token=');

  const resetResponse = await dispatch('/v1/auth/reset-password', { token: tokenFrom(fakeEmailSender.messages[1]), password: 'a replacement password' });
  expect(resetResponse.status).toBe(200);
  const previousRefreshResponse = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: previousSession.refreshToken });
  expect(previousRefreshResponse.status).toBe(401);
  const secondPreviousRefreshResponse = await dispatch('/v1/auth/refresh', { clientType: 'android', refreshToken: secondPreviousSession.refreshToken });
  expect(secondPreviousRefreshResponse.status).toBe(401);
  const previousAccessResponse = await dispatch('/v1/me', undefined, { authorization: `Bearer ${previousSession.accessToken}` }, 'GET');
  expect(previousAccessResponse.status).toBe(401);
  const reusedResponse = await dispatch('/v1/auth/reset-password', { token: tokenFrom(fakeEmailSender.messages[1]), password: 'another replacement password' });
  expect(reusedResponse.status).toBe(400);

  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a replacement password', clientType: 'android' });
  expect(loginResponse.status).toBe(200);
});

it('rejects unauthenticated profile requests', async () => {
  const response = await dispatch('/v1/me', undefined, {}, 'GET');
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
});

it('rejects an expired verification token', async () => {
  const email = `expired-${crypto.randomUUID()}@example.test`;
  await dispatch('/v1/auth/register', { name: 'Dani', email, password: 'a secure password' });
  await env.DB.prepare('UPDATE auth_tokens SET expires_at = ?').bind(new Date(Date.now() - 60_000).toISOString()).run();

  const response = await dispatch('/v1/auth/verify-email', { token: tokenFrom(fakeEmailSender.messages[0]) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
});

it('allows credentialed requests only from configured web origins', async () => {
  const response = await dispatch('/v1/auth/login', undefined, { origin: 'http://localhost:5173' }, 'OPTIONS');
  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
});

it('does not expose CORS credentials to an unconfigured origin', async () => {
  const response = await dispatch('/v1/auth/login', undefined, { origin: 'https://untrusted.example' }, 'OPTIONS');
  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
});

it('rejects malformed or oversized registration details', async () => {
  const malformedEmail = await dispatch('/v1/auth/register', { name: 'Ana', email: 'not-an-email', password: 'a secure password' });
  expect(malformedEmail.status).toBe(422);
  const oversizedName = await dispatch('/v1/auth/register', { name: 'n'.repeat(101), email: `name-${crypto.randomUUID()}@example.test`, password: 'a secure password' });
  expect(oversizedName.status).toBe(422);
  const malformedBirthDate = await dispatch('/v1/auth/register', { firstName: 'Ana', lastName: 'Test', birthDate: '31/12/2000', username: 'ana-test', email: `birth-${crypto.randomUUID()}@example.test`, password: 'a secure password' });
  expect(malformedBirthDate.status).toBe(422);
  const malformedUsername = await dispatch('/v1/auth/register', { firstName: 'Ana', lastName: 'Test', birthDate: '2000-12-31', username: 'no vale', email: `username-${crypto.randomUUID()}@example.test`, password: 'a secure password' });
  expect(malformedUsername.status).toBe(422);
});

it('sends a reset OTP and accepts it with the account email', async () => {
  const email = `otp-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);

  const forgottenResponse = await dispatch('/v1/auth/forgot-password', { email });

  expect(forgottenResponse.status).toBe(202);
  expect(fakeEmailSender.messages.at(-1)).toMatchObject({ to: email, subject: 'Restablece tu contraseña de NFCompra' });
  const message = fakeEmailSender.messages.at(-1)!;
  expect(message.text).toContain('http://app.test/auth/reset-password?token=');
  expect(message.text).toMatch(/Código de recuperación: \d{6}/);

  const response = await dispatch('/v1/auth/reset-password', { email, otp: otpFrom(message), password: 'a replacement password' });

  expect(response.status).toBe(200);
  const reusedResponse = await dispatch('/v1/auth/reset-password', { email, otp: otpFrom(message), password: 'another replacement password' });
  expect(reusedResponse.status).toBe(400);
  const loginResponse = await dispatch('/v1/auth/login', { email, password: 'a replacement password', clientType: 'android' });
  expect(loginResponse.status).toBe(200);
});

it('limits password reset OTP attempts before accepting the correct code', async () => {
  const email = `otp-limit-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  await dispatch('/v1/auth/forgot-password', { email });
  const message = fakeEmailSender.messages.at(-1)!;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await dispatch('/v1/auth/reset-password', { email, otp: '000000', password: 'a replacement password' });
    expect(response.status).toBe(400);
  }

  const blocked = await dispatch('/v1/auth/reset-password', { email, otp: otpFrom(message), password: 'a replacement password' });
  expect(blocked.status).toBe(400);
  expect(await blocked.json()).toMatchObject({ error: { code: 'INVALID_OR_EXPIRED_OTP' } });
});

it('verifies a password reset OTP before accepting the replacement password', async () => {
  const email = `otp-verify-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  await dispatch('/v1/auth/forgot-password', { email });
  const message = fakeEmailSender.messages.at(-1)!;

  const wrong = await dispatch('/v1/auth/verify-password-reset-otp', { email, otp: '000000' });
  expect(wrong.status).toBe(400);
  expect(await wrong.json()).toMatchObject({ error: { code: 'INVALID_OR_EXPIRED_OTP' } });

  const verified = await dispatch('/v1/auth/verify-password-reset-otp', { email, otp: otpFrom(message) });
  expect(verified.status).toBe(200);
  expect(await verified.json()).toEqual({ status: 'otp_verified' });

  const resetResponse = await dispatch('/v1/auth/reset-password', { email, otp: otpFrom(message), password: 'a replacement password' });
  expect(resetResponse.status).toBe(200);
});

it('rejects an oversized device name when issuing an Android session', async () => {
  const email = `device-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const response = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'android', deviceName: 'd'.repeat(101) });
  expect(response.status).toBe(422);
});

async function registerAndVerify(email: string): Promise<void> {
  const response = await dispatch('/v1/auth/register', { name: 'Cris', email, password: 'a secure password' });
  expect(response.status).toBe(201);
  const verifyResponse = await dispatch('/v1/auth/verify-email', { token: tokenFrom(fakeEmailSender.messages.at(-1)!) });
  expect(verifyResponse.status).toBe(200);
}

async function authHeaders(email: string): Promise<Record<string, string>> {
  const response = await dispatch('/v1/auth/login', { email, password: 'a secure password', clientType: 'web' });
  expect(response.status).toBe(200);
  const { accessToken } = await response.json<{ accessToken: string }>();
  return { authorization: `Bearer ${accessToken}` };
}

function tokenFrom(message: EmailMessage): string {
  const match = message.text.match(/token=([^\s]+)/);
  if (!match) throw new Error('El correo no contiene un token.');
  return decodeURIComponent(match[1]);
}

function otpFrom(message: EmailMessage): string {
  const match = message.text.match(/Código de recuperación: (\d{6})/);
  if (!match) throw new Error('El correo no contiene un OTP.');
  return match[1];
}

async function dispatch(path: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(
    new Request(`http://local${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
