import type { Env } from '../env';

export interface AuthUser {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  username: string | null;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  username: string | null;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  session_version: number;
  created_at: string;
  updated_at: string;
}

export interface UserWithPassword extends AuthUser {
  passwordHash: string;
  sessionVersion: number;
}

function mapUser(row: UserRow): UserWithPassword {
  return { id: row.id, name: row.name, firstName: row.first_name, lastName: row.last_name, birthDate: row.birth_date, username: row.username, email: row.email, passwordHash: row.password_hash, sessionVersion: row.session_version, emailVerifiedAt: row.email_verified_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function findUserByEmail(env: Env, email: string): Promise<UserWithPassword | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function findUserByUsername(env: Env, username: string): Promise<UserWithPassword | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function findUserById(env: Env, id: string): Promise<AuthUser | null> {
  return (await findUserSessionById(env, id))?.user ?? null;
}

export interface UserSession {
  user: AuthUser;
  sessionVersion: number;
}

export async function findUserSessionById(env: Env, id: string): Promise<UserSession | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!row) return null;
  const { passwordHash: _passwordHash, sessionVersion, ...user } = mapUser(row);
  return { user, sessionVersion };
}

export async function createUser(env: Env, input: { name: string; firstName?: string | null; lastName?: string | null; birthDate?: string | null; username?: string | null; email: string; passwordHash: string }): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, first_name, last_name, birth_date, username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.name, input.firstName ?? null, input.lastName ?? null, input.birthDate ?? null, input.username ?? null, input.email, input.passwordHash, now, now).run();
  return { id, name: input.name, firstName: input.firstName ?? null, lastName: input.lastName ?? null, birthDate: input.birthDate ?? null, username: input.username ?? null, email: input.email, emailVerifiedAt: null, createdAt: now, updatedAt: now };
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

export async function createAuthToken(env: Env, userId: string, type: 'email_verification' | 'password_reset', tokenHash: string, otpHash: string | null = null): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO auth_tokens (id, user_id, type, token_hash, otp_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, type, tokenHash, otpHash, expiresAt, now.toISOString()).run();
}

export async function consumeAuthToken(env: Env, type: 'email_verification' | 'password_reset', tokenHash: string): Promise<string | null> {
  const row = await env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE type = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(new Date().toISOString(), type, tokenHash, new Date().toISOString()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function consumePasswordResetOtp(env: Env, email: string, otpHash: string): Promise<string | null> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT auth_tokens.id, auth_tokens.user_id, auth_tokens.otp_hash, auth_tokens.otp_attempts
    FROM auth_tokens
    JOIN users ON users.id = auth_tokens.user_id
    WHERE users.email = ?
      AND auth_tokens.type = 'password_reset'
      AND auth_tokens.used_at IS NULL
      AND auth_tokens.expires_at > ?
      AND auth_tokens.otp_hash IS NOT NULL
    ORDER BY auth_tokens.created_at DESC
    LIMIT 1
  `).bind(email, now).first<{ id: string; user_id: string; otp_hash: string; otp_attempts: number }>();
  if (!row || row.otp_attempts >= 5) return null;
  if (row.otp_hash !== otpHash) {
    await env.DB.prepare('UPDATE auth_tokens SET otp_attempts = otp_attempts + 1 WHERE id = ? AND used_at IS NULL AND otp_attempts < 5').bind(row.id).run();
    return null;
  }
  const consumed = await env.DB.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND otp_attempts < 5 RETURNING user_id')
    .bind(now, row.id).first<{ user_id: string }>();
  return consumed?.user_id ?? null;
}

export async function verifyPasswordResetOtp(env: Env, email: string, otpHash: string): Promise<boolean> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT auth_tokens.id, auth_tokens.otp_hash, auth_tokens.otp_attempts
    FROM auth_tokens
    JOIN users ON users.id = auth_tokens.user_id
    WHERE users.email = ?
      AND auth_tokens.type = 'password_reset'
      AND auth_tokens.used_at IS NULL
      AND auth_tokens.expires_at > ?
      AND auth_tokens.otp_hash IS NOT NULL
    ORDER BY auth_tokens.created_at DESC
    LIMIT 1
  `).bind(email, now).first<{ id: string; otp_hash: string; otp_attempts: number }>();
  if (!row || row.otp_attempts >= 5) return false;
  if (row.otp_hash !== otpHash) {
    await env.DB.prepare('UPDATE auth_tokens SET otp_attempts = otp_attempts + 1 WHERE id = ? AND used_at IS NULL AND otp_attempts < 5').bind(row.id).run();
    return false;
  }
  return true;
}

export async function createRefreshToken(env: Env, userId: string, tokenHash: string, deviceName: string | null, sessionVersion: number): Promise<boolean> {
  const now = new Date();
  const result = await env.DB.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, device_name, session_version, expires_at, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM users
      WHERE id = ? AND session_version = ?
    )
  `).bind(crypto.randomUUID(), userId, tokenHash, deviceName, sessionVersion, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), now.toISOString(), userId, sessionVersion).run();
  return result.meta.changes === 1;
}

export interface RefreshTokenSession {
  userId: string;
  sessionVersion: number;
}

export async function consumeRefreshToken(env: Env, tokenHash: string): Promise<RefreshTokenSession | null> {
  const row = await env.DB.prepare(`
    UPDATE refresh_tokens SET revoked_at = ?
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
      AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = refresh_tokens.user_id
          AND users.session_version = refresh_tokens.session_version
      )
    RETURNING user_id, session_version
  `)
    .bind(new Date().toISOString(), tokenHash, new Date().toISOString()).first<{ user_id: string; session_version: number }>();
  return row ? { userId: row.user_id, sessionVersion: row.session_version } : null;
}

export async function revokeRefreshToken(env: Env, tokenHash: string): Promise<void> {
  await env.DB.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(new Date().toISOString(), tokenHash).run();
}

export async function invalidateSessions(env: Env, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET session_version = session_version + 1 WHERE id = ?').bind(userId),
    env.DB.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, userId),
  ]);
}
