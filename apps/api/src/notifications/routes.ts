import type { Env } from '../env';
import type { AuthUser } from '../middleware/auth';
import { errorResponse, notFound } from '../shared/http';
import { listNotifications, markAllNotificationsRead, markNotificationRead, unreadNotificationCount, deleteAllNotifications } from './repository';

const notificationPattern = /^\/v1\/notifications\/([^/]+)\/read$/;

export async function handleNotificationRoute(request: Request, env: Env, user: AuthUser): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/v1/notifications' && request.method === 'GET') {
    const rawLimit = url.searchParams.get('limit');
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return errorResponse('VALIDATION_ERROR', 'La solicitud no es valida.', 422);
    return Response.json({ notifications: await listNotifications(env, user.id, limit) });
  }
  if (url.pathname === '/v1/notifications/unread-count' && request.method === 'GET') {
    return Response.json({ count: await unreadNotificationCount(env, user.id) });
  }
  if (url.pathname === '/v1/notifications/read-all' && request.method === 'POST') {
    await markAllNotificationsRead(env, user.id);
    return Response.json({ status: 'read' });
  }
  if (url.pathname === '/v1/notifications' && request.method === 'DELETE') {
    await deleteAllNotifications(env, user.id);
    return Response.json({ status: 'deleted' });
  }
  const match = url.pathname.match(notificationPattern);
  if (!match || request.method !== 'PATCH') return null;
  if (!(await markNotificationRead(env, match[1], user.id))) return notFound();
  return Response.json({ status: 'read' });
}
