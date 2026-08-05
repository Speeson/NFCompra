import { createAuthToken, createRefreshToken, createUser, consumeAuthToken, consumePasswordResetOtp, consumeRefreshToken, findUserByEmail, findUserByUsername, invalidateSessions, revokeRefreshToken, updatePassword, updateUserName, verifyEmail, verifyPasswordResetOtp, type AuthUser } from './auth-repository';
import { hashPassword, verifyPassword } from './password-hasher';
import { createAccessToken, createRandomToken, hashToken } from './token-service';
import type { EmailSender } from '../email/email-sender';
import type { Env } from '../env';
import { errorResponse } from '../shared/http';

type ClientType = 'web' | 'android';
const EMAIL_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 100;
const USERNAME_MAX_LENGTH = 30;
const DEVICE_NAME_MAX_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OTP_PATTERN = /^\d{6}$/;

function readCookie(request: Request, name: string): string | null {
  return request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function refreshCookie(token: string, maxAge = 30 * 24 * 60 * 60): string {
  return `refresh_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/v1/auth; Max-Age=${maxAge}`;
}

async function json(request: Request): Promise<Record<string, unknown> | null> {
  try { return await request.json() as Record<string, unknown>; } catch { return null; }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedText(value: unknown, maximumLength: number): string | null {
  const normalized = text(value);
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function parseEmail(value: unknown): string | null {
  const normalized = boundedText(value, EMAIL_MAX_LENGTH)?.toLowerCase();
  return normalized && EMAIL_PATTERN.test(normalized) ? normalized : null;
}

function parseBirthDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const normalized = text(value);
  if (!normalized || !BIRTH_DATE_PATTERN.test(normalized)) return undefined;
  const [year, month, day] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? normalized : undefined;
}

function parseUsername(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const normalized = text(value);
  return normalized && normalized.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(normalized) ? normalized : undefined;
}

function deviceName(value: unknown): string | null | undefined {
  if (value === undefined) return null;
  return boundedText(value, DEVICE_NAME_MAX_LENGTH) ?? undefined;
}

function clientType(value: unknown): ClientType | null {
  return value === 'web' || value === 'android' ? value : null;
}

function createOtp(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

function parseOtp(value: unknown): string | null {
  const normalized = text(value);
  return normalized && OTP_PATTERN.test(normalized) ? normalized : null;
}

function isLocalAppBaseUrl(env: Env): boolean {
  return env.APP_BASE_URL.startsWith('http://localhost') || env.APP_BASE_URL.startsWith('http://127.0.0.1');
}

function invalidInput(): Response {
  return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
}

async function issueSession(env: Env, userId: string, client: ClientType, deviceName: string | null, sessionVersion: number): Promise<Response | null> {
  const refreshToken = createRandomToken();
  if (!(await createRefreshToken(env, userId, await hashToken(refreshToken), deviceName, sessionVersion))) return null;
  const body: Record<string, unknown> = { accessToken: await createAccessToken(userId, sessionVersion, env) };
  const headers = new Headers({ 'content-type': 'application/json' });
  if (client === 'web') headers.set('set-cookie', refreshCookie(refreshToken));
  else body.refreshToken = refreshToken;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

async function sendVerificationEmail(
  env: Env,
  emailSender: EmailSender,
  user: { id: string; email: string },
): Promise<void> {
  const token = createRandomToken();
  await createAuthToken(env, user.id, 'email_verification', await hashToken(token));
  const url = `${env.APP_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
  await emailSender.send({
    to: user.email,
    subject: 'Verifica tu correo de NFCompra',
    text: `Verifica tu correo: ${url}\n\nEste enlace caduca en 24 horas.`,
  });
}

function emailDeliveryFailed(purpose: 'verification' | 'password_reset'): Response {
  const verification = purpose === 'verification';
  return errorResponse(
    'EMAIL_DELIVERY_FAILED',
    verification ? 'No se pudo enviar el correo de verificación.' : 'No se pudo enviar el correo de recuperación.',
    503,
    verification ? { retryPath: '/v1/auth/resend-verification' } : { retryPath: '/v1/auth/forgot-password' },
  );
}

export async function handleAuthRoute(request: Request, env: Env, emailSender: EmailSender): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/v1/auth/')) return null;
  const action = path.slice('/v1/auth/'.length);
  const body = await json(request);
  if (request.method !== 'POST' || !body) return null;

  if (action === 'register') {
    const firstName = boundedText(body.firstName, NAME_MAX_LENGTH);
    const lastName = boundedText(body.lastName, NAME_MAX_LENGTH);
    const birthDate = parseBirthDate(body.birthDate);
    const username = parseUsername(body.username);
    const name = firstName ? [firstName, lastName].filter(Boolean).join(' ') : boundedText(body.name, NAME_MAX_LENGTH);
    const email = parseEmail(body.email);
    const password = text(body.password);
    if (!name || !email || !password || password.length < 8 || birthDate === undefined || username === undefined) return invalidInput();
    if (await findUserByEmail(env, email)) return errorResponse('EMAIL_ALREADY_REGISTERED', 'El correo ya está registrado.', 409);
    if (username && await findUserByUsername(env, username)) return errorResponse('USERNAME_ALREADY_REGISTERED', 'El nombre de usuario ya está registrado.', 409);
    const user = await createUser(env, { name, firstName, lastName, birthDate, username, email, passwordHash: await hashPassword(password) });
    try {
      await sendVerificationEmail(env, emailSender, user);
    } catch {
      return emailDeliveryFailed('verification');
    }
    return Response.json({ user }, { status: 201 });
  }

  if (action === 'resend-verification') {
    const email = parseEmail(body.email);
    if (!email) return invalidInput();
    const user = await findUserByEmail(env, email);
    if (user && !user.emailVerifiedAt) {
      try {
        await sendVerificationEmail(env, emailSender, user);
      } catch {
        // The public response stays identical for pending, verified, and unknown accounts.
      }
    }
    return Response.json({ status: 'accepted' }, { status: 202 });
  }

  if (action === 'verify-email') {
    const token = text(body.token);
    if (!token) return invalidInput();
    const userId = await consumeAuthToken(env, 'email_verification', await hashToken(token));
    if (!userId) return errorResponse('INVALID_OR_EXPIRED_TOKEN', 'El enlace no es válido o ha caducado.', 400);
    await verifyEmail(env, userId);
    return Response.json({ status: 'verified' });
  }

  if (action === 'login') {
    const email = parseEmail(body.email);
    const password = text(body.password);
    const client = clientType(body.clientType);
    const sessionDeviceName = deviceName(body.deviceName);
    if (!email || !password || !client || sessionDeviceName === undefined) return invalidInput();
    const user = await findUserByEmail(env, email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return errorResponse('INVALID_CREDENTIALS', 'Las credenciales no son válidas.', 401);
    if (!user.emailVerifiedAt) return errorResponse('EMAIL_NOT_VERIFIED', 'Debes verificar tu correo antes de iniciar sesión.', 403);
    return (await issueSession(env, user.id, client, sessionDeviceName, user.sessionVersion)) ?? errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
  }

  if (action === 'refresh') {
    const client = clientType(body.clientType);
    const refreshToken = client === 'web' ? readCookie(request, 'refresh_token') : text(body.refreshToken);
    const sessionDeviceName = deviceName(body.deviceName);
    if (!client || !refreshToken) return errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
    if (sessionDeviceName === undefined) return invalidInput();
    const session = await consumeRefreshToken(env, await hashToken(refreshToken));
    if (!session) return errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
    return (await issueSession(env, session.userId, client, sessionDeviceName, session.sessionVersion)) ?? errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
  }

  if (action === 'logout') {
    const client = clientType(body.clientType);
    const refreshToken = client === 'web' ? readCookie(request, 'refresh_token') : text(body.refreshToken);
    if (!client || !refreshToken) return errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
    await revokeRefreshToken(env, await hashToken(refreshToken));
    const headers = client === 'web' ? { 'set-cookie': refreshCookie('', 0) } : undefined;
    return Response.json({ status: 'logged_out' }, { headers });
  }

  if (action === 'forgot-password') {
    const email = parseEmail(body.email);
    if (!email) return invalidInput();
    const user = await findUserByEmail(env, email);
    if (user) {
      const token = createRandomToken();
      const otp = createOtp();
      await createAuthToken(env, user.id, 'password_reset', await hashToken(token), await hashToken(otp));
      const url = `${env.APP_BASE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
      const message = {
        to: user.email,
        subject: 'Restablece tu contraseña de NFCompra',
        text: `Restablece tu contraseña: ${url}\n\nCódigo de recuperación: ${otp}\n\nEste código caduca en 30 minutos.`,
      };
      if (isLocalAppBaseUrl(env)) {
        console.warn('Local password reset email skipped; using console OTP fallback.', { email: user.email, otp });
      } else {
        try {
          await emailSender.send(message);
        } catch {
          return emailDeliveryFailed('password_reset');
        }
      }
    }
    return Response.json({ status: 'accepted' }, { status: 202 });
  }

  if (action === 'verify-password-reset-otp') {
    const email = parseEmail(body.email);
    const otp = parseOtp(body.otp);
    if (!email || !otp) return invalidInput();
    if (!await verifyPasswordResetOtp(env, email, await hashToken(otp))) {
      return errorResponse('INVALID_OR_EXPIRED_OTP', 'El código no es válido o ha caducado.', 400);
    }
    return Response.json({ status: 'otp_verified' });
  }

  if (action === 'reset-password') {
    const token = text(body.token);
    const email = parseEmail(body.email);
    const otp = parseOtp(body.otp);
    const password = text(body.password) ?? text(body.newPassword);
    if (!password || password.length < 8 || (!token && (!email || !otp))) return invalidInput();
    const userId = token
      ? await consumeAuthToken(env, 'password_reset', await hashToken(token))
      : await consumePasswordResetOtp(env, email!, await hashToken(otp!));
    if (!userId) {
      return token
        ? errorResponse('INVALID_OR_EXPIRED_TOKEN', 'El enlace no es válido o ha caducado.', 400)
        : errorResponse('INVALID_OR_EXPIRED_OTP', 'El código no es válido o ha caducado.', 400);
    }
    await updatePassword(env, userId, await hashPassword(password));
    await invalidateSessions(env, userId);
    return Response.json({ status: 'password_reset' });
  }

  return null;
}

export async function handleMeRoute(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/v1/me') return null;
  if (request.method === 'GET') return Response.json({ user });
  if (request.method !== 'PATCH') return null;
  const body = await json(request);
  const name = body ? boundedText(body.name, NAME_MAX_LENGTH) : null;
  if (!name) return invalidInput();
  const updated = await updateUserName(env, user.id, name);
  return Response.json({ user: updated });
}
