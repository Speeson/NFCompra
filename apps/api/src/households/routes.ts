import type { AuthUser } from '../middleware/auth';
import type { Env } from '../env';
import { errorResponse } from '../shared/http';
import { createHousehold, listHouseholdsForUser } from './repository';

function householdName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 ? value.trim() : null;
}

export async function handleHouseholdRoute(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/v1/households') return null;
  if (request.method === 'GET') return Response.json({ households: await listHouseholdsForUser(env, user.id) });
  if (request.method !== 'POST') return null;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422); }
  const name = householdName(body.name);
  if (!name) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  return Response.json(await createHousehold(env, user.id, name), { status: 201 });
}
