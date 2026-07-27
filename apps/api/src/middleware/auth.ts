import { findUserSessionById, type AuthUser } from '../auth/auth-repository';
import { verifyAccessToken } from '../auth/token-service';
import type { Env } from '../env';

export type { AuthUser };

export async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  if (!token) throw new Error('UNAUTHORIZED');
  const tokenSession = await verifyAccessToken(token, env);
  const userSession = tokenSession ? await findUserSessionById(env, tokenSession.userId) : null;
  if (!userSession || userSession.sessionVersion !== tokenSession?.sessionVersion) throw new Error('UNAUTHORIZED');
  return userSession.user;
}
