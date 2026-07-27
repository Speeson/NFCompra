import type { Env } from './env';
import { handleAuthRoute, handleMeRoute } from './auth/routes';
import { requireUser } from './middleware/auth';
import { ResendEmailSender } from './email/resend-email-sender';
import type { EmailSender } from './email/email-sender';
import { errorResponse, notFound } from './shared/http';
import { handleHouseholdRoute } from './households/routes';
import { handleListRoute } from './lists/routes';

export function createWorker(emailSender?: EmailSender): ExportedHandler<Env> {
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') return withCors(request, env, new Response(null, { status: 204 }));
      let response: Response;
      if (new URL(request.url).pathname === '/health' && request.method === 'GET') {
        response = Response.json({ status: 'ok' });
      } else {
        const authResponse = await handleAuthRoute(request, env, emailSender ?? new ResendEmailSender(env));
        if (authResponse) response = authResponse;
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
          response = (await handleHouseholdRoute(request, env, user)) ?? (await handleListRoute(request, env, user)) ?? notFound();
        } else response = notFound();
      }
      return withCors(request, env, response);
    },
  };
}

function isShoppingRoute(path: string): boolean {
  return path === '/v1/households'
    || /^\/v1\/households\/[^/]+\/lists$/.test(path)
    || /^\/v1\/lists\/[^/]+\/items(?:\/checked)?$/.test(path)
    || /^\/v1\/items\/[^/]+$/.test(path);
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
