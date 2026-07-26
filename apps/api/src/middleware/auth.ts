import { findUserById, type AuthUser } from '../auth/auth-repository';
import { verifyAccessToken } from '../auth/token-service';
import type { Env } from '../env';

export type { AuthUser };

export async function requireUser(request: Request, env: Env): Promise<AuthUser> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null;
  if (!token) throw new Error('UNAUTHORIZED');
  const userId = await verifyAccessToken(token, env);
  const user = userId ? await findUserById(env, userId) : null;
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}
