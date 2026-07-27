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
  const invitations = await env.DB.prepare('PRAGMA table_info(invitations)').all<{ name: string }>();
  const invitationIndexes = await env.DB.prepare('PRAGMA index_list(invitations)').all<{ name: string }>();
  const notifications = await env.DB.prepare('PRAGMA table_info(notifications)').all<{ name: string }>();
  const notificationIndexes = await env.DB.prepare('PRAGMA index_list(notifications)').all<{ name: string }>();

  expect(users.results.map(({ name }) => name)).toContain('session_version');
  expect(refreshTokens.results.map(({ name }) => name)).toContain('session_version');
  expect(syncOperations.results.map(({ name }) => name)).toContain('lease_token');
  expect(invitations.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['invited_email', 'status', 'revoked_at', 'updated_at']));
  expect(invitationIndexes.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_invitations_active_household_email', 'idx_invitations_household_status']));
  expect(notifications.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['user_id', 'actor_user_id', 'list_id', 'type', 'grouped_until', 'read_at']));
  expect(notificationIndexes.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_notifications_user_read_created', 'idx_notifications_grouping']));
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>())
    .toEqual({ count: env.TEST_MIGRATIONS.length });
});
