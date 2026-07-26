import type { Env } from './env';
import { handleAuthRoute, handleMeRoute } from './auth/routes';
import { requireUser } from './middleware/auth';
import { ResendEmailSender } from './email/resend-email-sender';
import type { EmailSender } from './email/email-sender';
import { errorResponse, notFound } from './shared/http';

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
        } else response = notFound();
      }
      return withCors(request, env, response);
    },
  };
}

function withCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('origin');
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  if (!origin || !allowedOrigins.includes(origin)) return response;

  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'authorization, content-type');
  headers.set('access-control-allow-methods', 'GET, PATCH, POST, OPTIONS');
  headers.append('vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = createWorker();

export default worker;
