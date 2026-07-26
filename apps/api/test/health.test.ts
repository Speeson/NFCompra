import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../src';
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

it('returns an operational health response', async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(new Request('http://local/health'), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

it('returns a structured JSON error for an unknown route', async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(new Request('http://local/unknown'), env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: 'NOT_FOUND',
      message: 'Ruta no encontrada.',
      details: {},
    },
  });
});

it('does not expose the health response to POST requests', async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(new Request('http://local/health', { method: 'POST' }), env, ctx);
  await waitOnExecutionContext(ctx);

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: 'NOT_FOUND',
      message: 'Ruta no encontrada.',
      details: {},
    },
  });
});

it('can query the local D1 binding after migrations', async () => {
  const result = await env.DB.prepare('SELECT 1 AS value').first<{ value: number }>();
  expect(result).toEqual({ value: 1 });
});
