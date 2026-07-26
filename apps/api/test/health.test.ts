import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { expect, it } from 'vitest';
import worker from '../src';
import type { Env } from '../src/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

it('returns an operational health response', async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(new Request('http://local/health'), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});

it('can query the local D1 binding after migrations', async () => {
  const result = await env.DB.prepare('SELECT 1 AS value').first<{ value: number }>();
  expect(result).toEqual({ value: 1 });
});
