import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

const worker = createWorker();
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, first_name TEXT NULL, last_name TEXT NULL, birth_date TEXT NULL, username TEXT UNIQUE COLLATE NOCASE NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE, parent_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', source TEXT NULL, source_category_id TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, category_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', brand TEXT NULL, package_size TEXT NULL, source TEXT NULL, source_product_id TEXT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_aliases (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, created_at TEXT NOT NULL);
    DELETE FROM product_aliases;
    DELETE FROM product_catalog;
    DELETE FROM product_categories;
    DELETE FROM users;
  `);
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('user-a', 'Ana', 'ana@example.test', 'hash', now, now, now).run();
  await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('cat-dairy', 'Lacteos', 'lacteos', 'milk', now, now).run();
  await env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, brand, package_size, source, source_product_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('prod-milk', 'Leche entera', 'leche entera', 'cat-dairy', 'milk', 'Hacendado', '1 L', 'spanish-supermarkets', 'milk-1', now, now).run();
  await env.DB.prepare('INSERT INTO product_aliases (id, product_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind('alias-milk', 'prod-milk', 'leche normal', 'leche normal', now).run();
});

it('lists categories and searches the supermarket catalog for autocomplete', async () => {
  const categoriesResponse = await dispatch('/v1/product-categories', 'GET');
  expect(categoriesResponse.status).toBe(200);
  expect(await categoriesResponse.json()).toMatchObject({ categories: [{ id: 'cat-dairy', name: 'Lacteos', iconKey: 'milk' }] });

  const searchResponse = await dispatch('/v1/product-catalog?search=normal', 'GET');
  expect(searchResponse.status).toBe(200);
  expect(await searchResponse.json()).toMatchObject({
    products: [{
      id: 'prod-milk',
      name: 'Leche entera',
      normalizedName: 'leche entera',
      categoryId: 'cat-dairy',
      categoryName: 'Lacteos',
      iconKey: 'milk',
      brand: 'Hacendado',
      packageSize: '1 L',
    }],
  });
});

it('returns a compact catalog snapshot and version for client-side autocomplete caches', async () => {
  const versionResponse = await dispatch('/v1/product-catalog/version', 'GET');
  expect(versionResponse.status).toBe(200);
  expect(await versionResponse.json()).toMatchObject({
    version: expect.any(String),
    productCount: 1,
  });

  const snapshotResponse = await dispatch('/v1/product-catalog/snapshot', 'GET');
  expect(snapshotResponse.status).toBe(200);
  expect(await snapshotResponse.json()).toMatchObject({
    version: expect.any(String),
    products: [{
      id: 'prod-milk',
      name: 'Leche entera',
      normalizedName: 'leche entera',
      categoryId: 'cat-dairy',
      categoryName: 'Lacteos',
      iconKey: 'milk',
      brand: 'Hacendado',
      packageSize: '1 L',
      source: 'spanish-supermarkets',
      sourceProductId: 'milk-1',
    }],
  });
});

async function dispatch(path: string, method = 'POST'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(
    new Request(`http://local${path}`, {
      method,
      headers: { authorization: 'Bearer test-token' },
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
