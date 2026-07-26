import type { Env } from './env';
import { notFound } from './shared/http';

const worker: ExportedHandler<Env> = {
  async fetch(request) {
    if (new URL(request.url).pathname === '/health' && request.method === 'GET') {
      return Response.json({ status: 'ok' });
    }

    return notFound();
  },
};

export default worker;
