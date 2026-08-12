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
      WRANGLER_NOTIFICATION_MIGRATION: string;
    }
  }
}

it('applies every migration to an empty database through the remote Wrangler execution boundary', async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 5));
  await env.DB.exec(env.WRANGLER_NOTIFICATION_MIGRATION);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(6));

  const users = await env.DB.prepare('PRAGMA table_info(users)').all<{ name: string }>();
  const refreshTokens = await env.DB.prepare('PRAGMA table_info(refresh_tokens)').all<{ name: string }>();
  const syncOperations = await env.DB.prepare('PRAGMA table_info(sync_operations)').all<{ name: string }>();
  const invitations = await env.DB.prepare('PRAGMA table_info(invitations)').all<{ name: string }>();
  const invitationIndexes = await env.DB.prepare('PRAGMA index_list(invitations)').all<{ name: string }>();
  const notifications = await env.DB.prepare('PRAGMA table_info(notifications)').all<{ name: string }>();
  const notificationIndexes = await env.DB.prepare('PRAGMA index_list(notifications)').all<{ name: string }>();
  const productCategories = await env.DB.prepare('PRAGMA table_info(product_categories)').all<{ name: string }>();
  const productCatalog = await env.DB.prepare('PRAGMA table_info(product_catalog)').all<{ name: string }>();
  const productAliases = await env.DB.prepare('PRAGMA table_info(product_aliases)').all<{ name: string }>();
  const productAliasIndexes = await env.DB.prepare('PRAGMA index_list(product_aliases)').all<{ name: string }>();
  const productFavorites = await env.DB.prepare('PRAGMA table_info(user_product_favorites)').all<{ name: string }>();
  const shoppingItems = await env.DB.prepare('PRAGMA table_info(shopping_items)').all<{ name: string }>();
  const notificationTriggers = await env.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'notifications_%' ORDER BY name")
    .all<{ name: string }>();

  expect(users.results.map(({ name }) => name)).toContain('session_version');
  expect(refreshTokens.results.map(({ name }) => name)).toContain('session_version');
  expect(syncOperations.results.map(({ name }) => name)).toContain('lease_token');
  expect(invitations.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['invited_email', 'status', 'revoked_at', 'updated_at']));
  expect(invitationIndexes.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_invitations_active_household_email', 'idx_invitations_household_status']));
  expect(notifications.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['user_id', 'actor_user_id', 'list_id', 'type', 'grouped_until', 'read_at']));
  expect(notificationIndexes.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_notifications_user_read_created', 'idx_notifications_grouping']));
  expect(users.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['first_name', 'last_name', 'birth_date', 'username']));
  expect(productCategories.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['id', 'name', 'normalized_name', 'icon_key']));
  expect(productCatalog.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['id', 'name', 'normalized_name', 'category_id', 'icon_key', 'source_product_id']));
  expect(productAliases.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['id', 'product_id', 'alias', 'normalized_alias']));
  expect(productAliasIndexes.results.map(({ name }) => name)).toContain('idx_product_aliases_product');
  expect(productFavorites.results.map(({ name }) => name)).toEqual(expect.arrayContaining(['user_id', 'product_id', 'created_at']));
  expect(shoppingItems.results.map(({ name }) => name)).toContain('catalog_product_id');
  expect(notificationTriggers.results.map(({ name }) => name)).toEqual([
    'notifications_invitation_accepted',
    'notifications_invitation_received',
    'notifications_item_created',
    'notifications_item_deleted',
    'notifications_item_updated',
    'notifications_member_removed',
  ]);
  expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first<{ count: number }>())
    .toEqual({ count: env.TEST_MIGRATIONS.length });
});
