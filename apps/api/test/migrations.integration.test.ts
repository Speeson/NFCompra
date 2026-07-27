import { applyD1Migrations, env } from 'cloudflare:test';
import { expect, it } from 'vitest';

interface Migration {
  name: string;
  queries: string[];
}

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: Migration[];
    }
  }
}

it('applies every migration to an empty database', async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

  const users = await env.DB.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  const refreshTokens = await env.DB.prepare('PRAGMA table_info(refresh_tokens)').all<{ name: string }>();
  const syncOperations = await env.DB.prepare('PRAGMA table_info(sync_operations)').all<{ name: string }>();

  expect(users.results.map(({ name }) => name)).toContain('session_version');
  expect(refreshTokens.results.map(({ name }) => name)).toContain('session_version');
  expect(syncOperations.results.map(({ name }) => name)).toContain('lease_token');
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>())
    .toEqual({ count: env.TEST_MIGRATIONS.length });
});
