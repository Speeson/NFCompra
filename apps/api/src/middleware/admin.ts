import type { AuthUser } from './auth';
import { errorResponse } from '../shared/http';

export function requireAdmin(user: AuthUser | undefined): Response | null {
  if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
  if (user.role !== 'admin') return errorResponse('FORBIDDEN', 'No tienes permisos para administrar el catálogo.', 403);
  return null;
}
