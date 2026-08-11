import type { Env } from './env';
import { handleAuthRoute, handleMeRoute } from './auth/routes';
import { requireUser } from './middleware/auth';
import { ResendEmailSender } from './email/resend-email-sender';
import type { EmailSender } from './email/email-sender';
import { errorResponse, notFound } from './shared/http';
import { handleHouseholdRoute } from './households/routes';
import { handleInvitationRoute } from './invitations/routes';
import { handleListRoute } from './lists/routes';
import { handleNotificationRoute } from './notifications/routes';
import { handleCatalogRoute } from './catalog/routes';

export function createWorker(emailSender?: EmailSender): ExportedHandler<Env> {
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') return withCors(request, env, new Response(null, { status: 204 }));
      let response: Response;
      if (new URL(request.url).pathname === '/health' && request.method === 'GET') {
        response = Response.json({ status: 'ok' });
      } else {
        const catalogResponse = await handleCatalogRequest(request, env);
        const authResponse = catalogResponse ? null : await handleAuthRoute(request, env, emailSender ?? new ResendEmailSender(env));
        if (catalogResponse) response = catalogResponse;
        else if (authResponse) response = authResponse;
        else if (new URL(request.url).pathname === '/v1/me') {
          try {
            const user = await requireUser(request, env);
            response = (await handleMeRoute(request, env, user)) ?? notFound();
          } catch {
            response = errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
          }
        } else if (isShoppingRoute(new URL(request.url).pathname)) {
          let user;
          try {
            user = await requireUser(request, env);
          } catch {
            response = errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
            return withCors(request, env, response);
          }
          const sender = emailSender ?? new ResendEmailSender(env);
          response = (await handleHouseholdRoute(request, env, user))
            ?? (await handleInvitationRoute(request, env, user, sender))
            ?? (await handleListRoute(request, env, user))
            ?? (await handleNotificationRoute(request, env, user))
            ?? notFound();
        } else response = notFound();
      }
      return withCors(request, env, response);
    },
  };
}

function isShoppingRoute(path: string): boolean {
  return path === '/v1/households'
    || /^\/v1\/households\/[^/]+$/.test(path)
    || path === '/v1/invitations/accept'
    || /^\/v1\/invitations\/[^/]+\/accept$/.test(path)
    || path === '/v1/notifications'
    || path === '/v1/notifications/unread-count'
    || path === '/v1/notifications/read-all'
    || /^\/v1\/notifications\/[^/]+\/read$/.test(path)
    || /^\/v1\/notifications\/[^/]+$/.test(path)
    || /^\/v1\/households\/[^/]+\/(?:invitations|members|leave)(?:\/[^/]+)?$/.test(path)
    || /^\/v1\/households\/[^/]+\/lists$/.test(path)
    || /^\/v1\/lists\/[^/]+$/.test(path)
    || /^\/v1\/lists\/[^/]+\/items(?:\/checked)?$/.test(path)
    || /^\/v1\/items\/[^/]+$/.test(path);
}

async function handleCatalogRequest(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!isCatalogRoute(path)) return null;
  const requiresUser = request.method !== 'GET' || /^\/v1\/product-catalog\/[^/]+\/favorite$/.test(path);
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ') === true;
  if (!requiresUser && !hasBearer) return handleCatalogRoute(request, env);
  try {
    const user = await requireUser(request, env);
    return handleCatalogRoute(request, env, user);
  } catch {
    if (requiresUser || hasBearer) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
    return handleCatalogRoute(request, env);
  }
}

function isCatalogRoute(path: string): boolean {
  return path === '/v1/product-categories'
    || /^\/v1\/product-categories\/[^/]+$/.test(path)
    || path === '/v1/product-catalog'
    || /^\/v1\/product-catalog\/[^/]+$/.test(path)
    || path === '/v1/product-catalog/version'
    || path === '/v1/product-catalog/snapshot'
    || /^\/v1\/product-catalog\/[^/]+\/favorite$/.test(path);
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('origin');
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  if (!origin || !allowedOrigins.includes(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, PATCH, POST, DELETE, OPTIONS');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = createWorker();

export default worker;
