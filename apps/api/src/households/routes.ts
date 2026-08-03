import type { AuthUser } from '../middleware/auth';
import type { Env } from '../env';
import { errorResponse } from '../shared/http';
import { createHousehold, deleteHousehold, findHousehold, isHouseholdOwner, listHouseholdsForUser, updateHousehold } from './repository';

function householdName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100 ? value.trim() : null;
}

export async function handleHouseholdRoute(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const singleMatch = path.match(/^\/v1\/households\/([^/]+)$/);
  if (singleMatch) return handleSingleHouseholdRoute(request, env, user, singleMatch[1]);
  if (path !== '/v1/households') return null;
  if (request.method === 'GET') return Response.json({ households: await listHouseholdsForUser(env, user.id) });
  if (request.method !== 'POST') return null;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422); }
  const name = householdName(body.name);
  if (!name) return errorResponse('VALIDATION_ERROR', 'La solicitud no es válida.', 422);
  return Response.json(await createHousehold(env, user.id, name), { status: 201 });
}

async function handleSingleHouseholdRoute(request: Request, env: Env, user: AuthUser, householdId: string): Promise<Response | null> {
  if (request.method !== 'PATCH' && request.method !== 'DELETE') return null;
  const current = await findHousehold(env, householdId);
  if (!current) return errorResponse('HOUSEHOLD_NOT_FOUND', 'El hogar no existe.', 404);
  if (!(await isHouseholdOwner(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No puedes administrar este hogar.', 403);
  if (request.method === 'DELETE') return Response.json({ status: (await deleteHousehold(env, householdId)) ? 'deleted' : 'missing' });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return errorResponse('VALIDATION_ERROR', 'La solicitud no es vÃ¡lida.', 422); }
  const name = householdName(body.name);
  if (!name) return errorResponse('VALIDATION_ERROR', 'La solicitud no es vÃ¡lida.', 422);
  return Response.json({ household: await updateHousehold(env, householdId, name) });
}
