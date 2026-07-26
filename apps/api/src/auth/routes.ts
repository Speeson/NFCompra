import { createAuthToken, createRefreshToken, createUser, consumeAuthToken, consumeRefreshToken, findUserByEmail, revokeRefreshToken, updatePassword, updateUserName, verifyEmail } from './auth-repository';
import { hashPassword, verifyPassword } from './password-hasher';
import { createAccessToken, createRandomToken, hashToken } from './token-service';
import type { EmailSender } from '../email/email-sender';
import type { Env } from '../env';
import { errorResponse } from '../shared/http';

type ClientType = 'web' | 'android';

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

function clientType(value: unknown): ClientType | null {
  return value === 'web' || value === 'android' ? value : null;
}

function invalidInput(): Response {
  return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
}

async function issueSession(env: Env, userId: string, client: ClientType, deviceName: string | null): Promise<Response> {
  const refreshToken = createRandomToken();
  await createRefreshToken(env, userId, await hashToken(refreshToken), deviceName);
  const body: Record<string, unknown> = { accessToken: await createAccessToken(userId, env) };
  const headers = new Headers({ 'content-type': 'application/json' });
  if (client === 'web') headers.set('set-cookie', refreshCookie(refreshToken));
  else body.refreshToken = refreshToken;
  return new Response(JSON.stringify(body), { status: 200, headers });
}

export async function handleAuthRoute(request: Request, env: Env, emailSender: EmailSender): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/v1/auth/')) return null;
  const action = path.slice('/v1/auth/'.length);
  const body = await json(request);
  if (request.method !== 'POST' || !body) return null;

  if (action === 'register') {
    const name = text(body.name);
    const email = text(body.email)?.toLowerCase();
    const password = text(body.password);
    if (!name || !email || !password || password.length < 8) return invalidInput();
    if (await findUserByEmail(env, email)) return errorResponse('EMAIL_ALREADY_REGISTERED', 'El correo ya está registrado.', 409);
    const user = await createUser(env, { name, email, passwordHash: await hashPassword(password) });
    const token = createRandomToken();
    await createAuthToken(env, user.id, 'email_verification', await hashToken(token));
    const url = `${env.APP_BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`;
    await emailSender.send({ to: user.email, subject: 'Verifica tu correo de NFCompra', text: `Verifica tu correo: ${url}` });
    return Response.json({ user }, { status: 201 });
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
    const email = text(body.email)?.toLowerCase();
    const password = text(body.password);
    const client = clientType(body.clientType);
    if (!email || !password || !client) return invalidInput();
    const user = await findUserByEmail(env, email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) return errorResponse('INVALID_CREDENTIALS', 'Las credenciales no son válidas.', 401);
    if (!user.emailVerifiedAt) return errorResponse('EMAIL_NOT_VERIFIED', 'Debes verificar tu correo antes de iniciar sesión.', 403);
    return issueSession(env, user.id, client, text(body.deviceName));
  }

  if (action === 'refresh') {
    const client = clientType(body.clientType);
    const refreshToken = client === 'web' ? readCookie(request, 'refresh_token') : text(body.refreshToken);
    if (!client || !refreshToken) return errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
    const userId = await consumeRefreshToken(env, await hashToken(refreshToken));
    if (!userId) return errorResponse('UNAUTHORIZED', 'La sesión no es válida.', 401);
    return issueSession(env, userId, client, text(body.deviceName));
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
    const email = text(body.email)?.toLowerCase();
    if (!email) return invalidInput();
    const user = await findUserByEmail(env, email);
    if (user) {
      const token = createRandomToken();
      await createAuthToken(env, user.id, 'password_reset', await hashToken(token));
      const url = `${env.APP_BASE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
      await emailSender.send({ to: user.email, subject: 'Restablece tu contraseña de NFCompra', text: `Restablece tu contraseña: ${url}` });
    }
    return Response.json({ status: 'accepted' }, { status: 202 });
  }

  if (action === 'reset-password') {
    const token = text(body.token);
    const password = text(body.password) ?? text(body.newPassword);
    if (!token || !password || password.length < 8) return invalidInput();
    const userId = await consumeAuthToken(env, 'password_reset', await hashToken(token));
    if (!userId) return errorResponse('INVALID_OR_EXPIRED_TOKEN', 'El enlace no es válido o ha caducado.', 400);
    await updatePassword(env, userId, await hashPassword(password));
    return Response.json({ status: 'password_reset' });
  }

  return null;
}

export async function handleMeRoute(request: Request, env: Env, user: { id: string; name: string; email: string; emailVerifiedAt: string | null; createdAt: string; updatedAt: string }): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/v1/me') return null;
  if (request.method === 'GET') return Response.json({ user });
  if (request.method !== 'PATCH') return null;
  const body = await json(request);
  const name = body ? text(body.name) : null;
  if (!name) return invalidInput();
  const updated = await updateUserName(env, user.id, name);
  return Response.json({ user: updated });
}
