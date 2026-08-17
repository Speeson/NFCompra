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
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(6, 15));
});

it('turns existing catalog products and categories into system resources without losing data', async () => {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('cat-dairy', 'Lacteos', 'lacteos', 'milk', now, now).run();
  await env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, source, source_product_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('prod-milk', 'Leche entera', 'leche entera', 'cat-dairy', 'milk', 'spanish-supermarkets', 'milk-1', now, now).run();

  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(15, 16));

  const category = await env.DB.prepare('SELECT scope, household_id, created_by FROM product_categories WHERE id = ?').bind('cat-dairy').first<{ scope: string; household_id: string | null; created_by: string | null }>();
  expect(category).toEqual({ scope: 'system', household_id: null, created_by: null });

  const product = await env.DB.prepare('SELECT scope, household_id, created_by, name FROM product_catalog WHERE id = ?').bind('prod-milk').first<{ scope: string; household_id: string | null; created_by: string | null; name: string }>();
  expect(product).toMatchObject({ scope: 'system', household_id: null, created_by: null, name: 'Leche entera' });

  const productCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM product_catalog WHERE is_active = 1 AND scope = \'system\'').first<{ count: number }>();
  expect(productCount?.count).toBe(1);
});

it('enforces scoped category uniqueness and valid scope values', async () => {
  const now = new Date().toISOString();
  const system = await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('sys-dup', 'Bebidas', 'bebidas', 'system', null, now, now).run();
  expect(system.meta.changes).toBe(1);

  const duplicateSystem = env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('sys-dup-2', 'Bebidas', 'bebidas', 'system', null, now, now).run();
  await expect(duplicateSystem).rejects.toThrow();

  const h1 = env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('h1-bebidas', 'Bebidas', 'bebidas', 'household', 'h1', now, now).run();
  expect((await h1).meta.changes).toBe(1);

  const h2 = env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('h2-bebidas', 'Bebidas', 'bebidas', 'household', 'h2', now, now).run();
  expect((await h2).meta.changes).toBe(1);

  const duplicateInH1 = env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('h1-bebidas-2', 'Bebidas', 'bebidas', 'household', 'h1', now, now).run();
  await expect(duplicateInH1).rejects.toThrow();

  const invalidScope = env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, scope, household_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('bad-scope', 'X', 'x', 'other', null, now, now).run();
  await expect(invalidScope).rejects.toThrow();
});
