import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, expect, it } from 'vitest';

interface Migration {
  name: string;
  queries: string[];
}

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_MIGRATIONS: Migration[];
      WRANGLER_NOTIFICATION_MIGRATION: string;
    }
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 5));
  await env.DB.exec(env.WRANGLER_NOTIFICATION_MIGRATION);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(6, 14));
});

it('gives existing users the safe user role when the role migration is applied', async () => {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('legacy-user', 'Legacy', 'legacy@example.test', 'hash', now, now).run();

  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(14, 15));

  const columns = await env.DB.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  expect(columns.results.map(({ name }) => name)).toContain('role');

  const legacy = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind('legacy-user').first<{ role: string }>();
  expect(legacy?.role).toBe('user');
});

it('defaults newly created users to user and enforces the role check constraint', async () => {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('new-user', 'Nueva', 'nueva@example.test', 'hash', now, now).run();
  const created = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind('new-user').first<{ role: string }>();
  expect(created?.role).toBe('user');

  const invalid = env.DB.prepare('INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('bad-role', 'Mala', 'mala@example.test', 'hash', 'superuser', now, now).run();
  await expect(invalid).rejects.toThrow();
});
