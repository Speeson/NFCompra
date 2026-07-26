import type { Env } from '../env';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWithPassword extends AuthUser { passwordHash: string }

function mapUser(row: UserRow): UserWithPassword {
  return { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, emailVerifiedAt: row.email_verified_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function findUserByEmail(env: Env, email: string): Promise<UserWithPassword | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function findUserById(env: Env, id: string): Promise<AuthUser | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) return null;
  const { passwordHash: _passwordHash, ...user } = mapUser(row);
  return user;
}

export async function createUser(env: Env, input: { name: string; email: string; passwordHash: string }): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, input.name, input.email, input.passwordHash, now, now).run();
  return { id, name: input.name, email: input.email, emailVerifiedAt: null, createdAt: now, updatedAt: now };
}

export async function verifyEmail(env: Env, id: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?').bind(now, now, id).run();
}

export async function updateUserName(env: Env, id: string, name: string): Promise<AuthUser | null> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?').bind(name, now, id).run();
  return findUserById(env, id);
}

export async function updatePassword(env: Env, id: string, passwordHash: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, now, id).run();
}

export async function createAuthToken(env: Env, userId: string, type: 'email_verification' | 'password_reset', tokenHash: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, type, tokenHash, expiresAt, now.toISOString()).run();
}

export async function consumeAuthToken(env: Env, type: 'email_verification' | 'password_reset', tokenHash: string): Promise<string | null> {
  const row = await env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE type = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(new Date().toISOString(), type, tokenHash, new Date().toISOString()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function createRefreshToken(env: Env, userId: string, tokenHash: string, deviceName: string | null): Promise<void> {
  const now = new Date();
  await env.DB.prepare('INSERT INTO refresh_tokens (id, user_id, token_hash, device_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, tokenHash, deviceName, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString()).run();
}

export async function consumeRefreshToken(env: Env, tokenHash: string): Promise<string | null> {
  const row = await env.DB.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(new Date().toISOString(), tokenHash, new Date().toISOString()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function revokeRefreshToken(env: Env, tokenHash: string): Promise<void> {
  await env.DB.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(new Date().toISOString(), tokenHash).run();
}
