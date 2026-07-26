import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import type { Env as WorkerEnv } from '../src/env';
import type { EmailMessage, EmailSender } from '../src/email/email-sender';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> { this.messages.push(message); }
}

const fakeEmailSender = new FakeEmailSender();
const worker = createWorker(fakeEmailSender);
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_name TEXT NULL, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL);
    DELETE FROM refresh_tokens;
    DELETE FROM auth_tokens;
    DELETE FROM users;
  `);
  fakeEmailSender.messages = [];
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
  expect(loginResponse.headers.get('set-cookie')).toContain('refresh_token=');
  expect(loginResponse.headers.get('set-cookie')).toContain('HttpOnly');
  const { accessToken } = await loginResponse.json<{ accessToken: string }>();

  const meResponse = await dispatch('/v1/me', undefined, { authorization: `Bearer ${accessToken}` }, 'GET');
  expect(meResponse.status).toBe(200);
  expect(await meResponse.json()).toMatchObject({ user: { name: 'Bea', email } });

  const updateResponse = await dispatch('/v1/me', { name: 'Beatriz' }, { authorization: `Bearer ${accessToken}` }, 'PATCH');
  expect(updateResponse.status).toBe(200);
  expect(await updateResponse.json()).toMatchObject({ user: { name: 'Beatriz' } });
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

it('sends a reset link and accepts the replacement password once', async () => {
  const email = `reset-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const forgottenResponse = await dispatch('/v1/auth/forgot-password', { email });
  expect(forgottenResponse.status).toBe(202);
  expect(fakeEmailSender.messages).toHaveLength(2);
  expect(fakeEmailSender.messages[1]).toMatchObject({ to: email, subject: 'Restablece tu contraseña de NFCompra' });
  expect(fakeEmailSender.messages[1].text).toContain('http://app.test/auth/reset-password?token=');

  const resetResponse = await dispatch('/v1/auth/reset-password', { token: tokenFrom(fakeEmailSender.messages[1]), password: 'a replacement password' });
  expect(resetResponse.status).toBe(200);
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
