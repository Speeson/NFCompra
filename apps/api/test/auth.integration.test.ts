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
    await this.send({ to: message.to, subject: message.subject, text: `Acepta la invitacion: ${message.url}` });
  }
}

const fakeEmailSender = new FakeEmailSender();
const worker = createWorker(fakeEmailSender);
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT NULL, created_at TEXT NOT NULL);
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
  const verifyResponse = await dispatch('/v1/auth/verify-email', { token: tokenFrom(fakeEmailSender.messages[0]) });
  expect(verifyResponse.status).toBe(200);
}

function tokenFrom(message: EmailMessage): string {
  const match = message.text.match(/token=([^\s]+)/);
  if (!match) throw new Error('El correo no contiene un token.');
  return decodeURIComponent(match[1]);
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
