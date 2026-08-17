import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import type { Env as WorkerEnv } from '../src/env';
import { createAccessToken } from '../src/auth/token-service';
import type { EmailMessage, EmailSender, InvitationEmailMessage } from '../src/email/email-sender';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  failure: Error | null = null;
  async send(message: EmailMessage): Promise<void> {
    if (this.failure) throw this.failure;
    this.messages.push(message);
  }
  async sendInvitation(message: InvitationEmailMessage): Promise<void> {
    await this.send({ to: message.to, subject: `Invitación a ${message.householdName}`, text: `Te han invitado a ${message.householdName}. Acepta: ${message.url}` });
  }
}

const fakeEmailSender = new FakeEmailSender();
const worker = createWorker(fakeEmailSender);
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, first_name TEXT NULL, last_name TEXT NULL, birth_date TEXT NULL, username TEXT UNIQUE COLLATE NOCASE NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')), email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, otp_hash TEXT NULL UNIQUE, otp_attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_name TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, parent_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', source TEXT NULL, source_category_id TEXT NULL, scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household')), household_id TEXT NULL, created_by TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_scope_name ON product_categories(scope, COALESCE(household_id, ''), normalized_name);
    CREATE TABLE IF NOT EXISTS product_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, category_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', brand TEXT NULL, package_size TEXT NULL, source TEXT NULL, source_product_id TEXT NULL, scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household')), household_id TEXT NULL, created_by TEXT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_aliases (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_product_favorites (user_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, product_id));
    DELETE FROM user_product_favorites;
    DELETE FROM product_aliases;
    DELETE FROM product_catalog;
    DELETE FROM product_categories;
    DELETE FROM refresh_tokens;
    DELETE FROM auth_tokens;
    DELETE FROM users;
  `);
  fakeEmailSender.messages = [];
  fakeEmailSender.failure = null;
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind('user-a', 'Ana', 'ana@example.test', 'hash', now, now, now).run();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, role, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('admin-a', 'Admin', 'admin@example.test', 'hash', 'admin', now, now, now).run();
  await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('cat-dairy', 'Lacteos', 'lacteos', 'milk', now, now).run();
  await env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, brand, package_size, source, source_product_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('prod-milk', 'Leche entera', 'leche entera', 'cat-dairy', 'milk', 'Hacendado', '1 L', 'spanish-supermarkets', 'milk-1', now, now).run();
});

it('rejects anonymous catalog mutations with 401', async () => {
  const createCategory = await dispatch('/v1/product-categories', 'POST', undefined, { name: 'Bebidas' });
  expect(createCategory.status).toBe(401);

  const updateCategory = await dispatch('/v1/product-categories/cat-dairy', 'PATCH', undefined, { name: 'Lacteos frescos' });
  expect(updateCategory.status).toBe(401);

  const deleteCategory = await dispatch('/v1/product-categories/cat-dairy', 'DELETE');
  expect(deleteCategory.status).toBe(401);

  const createProduct = await dispatch('/v1/product-catalog', 'POST', undefined, { name: 'Agua mineral' });
  expect(createProduct.status).toBe(401);

  const updateProduct = await dispatch('/v1/product-catalog/prod-milk', 'PATCH', undefined, { name: 'Leche semidesnatada' });
  expect(updateProduct.status).toBe(401);

  const deleteProduct = await dispatch('/v1/product-catalog/prod-milk', 'DELETE');
  expect(deleteProduct.status).toBe(401);
});

it('forbids normal users from creating, editing and deleting categories and products with 403', async () => {
  const token = await createAccessToken('user-a', 0, testEnv);

  const createCategory = await dispatch('/v1/product-categories', 'POST', token, { name: 'Bebidas' });
  expect(createCategory.status).toBe(403);
  expect(await createCategory.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });

  const updateCategory = await dispatch('/v1/product-categories/cat-dairy', 'PATCH', token, { name: 'Lacteos frescos' });
  expect(updateCategory.status).toBe(403);

  const deleteCategory = await dispatch('/v1/product-categories/cat-dairy', 'DELETE', token);
  expect(deleteCategory.status).toBe(403);

  const createProduct = await dispatch('/v1/product-catalog', 'POST', token, { name: 'Agua mineral' });
  expect(createProduct.status).toBe(403);

  const updateProduct = await dispatch('/v1/product-catalog/prod-milk', 'PATCH', token, { name: 'Leche semidesnatada' });
  expect(updateProduct.status).toBe(403);

  const deleteProduct = await dispatch('/v1/product-catalog/prod-milk', 'DELETE', token);
  expect(deleteProduct.status).toBe(403);
});

it('lets an administrator create, edit and delete categories and products', async () => {
  const token = await createAccessToken('admin-a', 0, testEnv);

  const createCategory = await dispatch('/v1/product-categories', 'POST', token, { name: 'Bebidas', iconKey: 'drink' });
  expect(createCategory.status).toBe(201);
  const category = await createCategory.json() as { category: { id: string } };

  const updateCategory = await dispatch(`/v1/product-categories/${category.category.id}`, 'PATCH', token, { name: 'Bebidas frescas' });
  expect(updateCategory.status).toBe(200);

  const createProduct = await dispatch('/v1/product-catalog', 'POST', token, { name: 'Agua mineral', categoryId: category.category.id, iconKey: 'water' });
  expect(createProduct.status).toBe(201);
  const product = await createProduct.json() as { product: { id: string } };

  const updateProduct = await dispatch(`/v1/product-catalog/${product.product.id}`, 'PATCH', token, { name: 'Agua con gas' });
  expect(updateProduct.status).toBe(200);

  const deleteProduct = await dispatch(`/v1/product-catalog/${product.product.id}`, 'DELETE', token);
  expect(deleteProduct.status).toBe(200);

  const deleteCategory = await dispatch(`/v1/product-categories/${category.category.id}`, 'DELETE', token);
  expect(deleteCategory.status).toBe(200);
});

it('keeps favorites working for a normal authenticated user', async () => {
  const token = await createAccessToken('user-a', 0, testEnv);

  const addResponse = await dispatch('/v1/product-catalog/prod-milk/favorite', 'POST', token);
  expect(addResponse.status).toBe(200);
  expect(await addResponse.json()).toEqual({ productId: 'prod-milk', isFavorite: true });

  const removeResponse = await dispatch('/v1/product-catalog/prod-milk/favorite', 'DELETE', token);
  expect(removeResponse.status).toBe(200);
  expect(await removeResponse.json()).toEqual({ productId: 'prod-milk', isFavorite: false });
});

it('preserves the public catalog read contract', async () => {
  const categoriesResponse = await dispatch('/v1/product-categories', 'GET');
  expect(categoriesResponse.status).toBe(200);
  expect(await categoriesResponse.json()).toMatchObject({ categories: [{ id: 'cat-dairy', name: 'Lacteos' }] });

  const searchResponse = await dispatch('/v1/product-catalog?search=leche', 'GET');
  expect(searchResponse.status).toBe(200);
  expect(await searchResponse.json()).toMatchObject({ products: [{ id: 'prod-milk', name: 'Leche entera' }] });

  const versionResponse = await dispatch('/v1/product-catalog/version', 'GET');
  expect(versionResponse.status).toBe(200);
  const version = await versionResponse.json() as { version: string; productCount: number };
  expect(version.version).toEqual(expect.any(String));
  expect(version.productCount).toBe(1);

  const snapshotResponse = await dispatch('/v1/product-catalog/snapshot', 'GET');
  expect(snapshotResponse.status).toBe(200);
  const snapshot = await snapshotResponse.json() as { version: string; productCount: number; products: unknown[] };
  expect(snapshot.productCount).toBe(1);
  expect(snapshot.products).toHaveLength(1);
});

it('assigns the user role to newly registered accounts', async () => {
  const email = `new-role-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const token = await accessToken(email);

  const meResponse = await dispatch('/v1/me', 'GET', token);
  expect(meResponse.status).toBe(200);
  expect(await meResponse.json()).toMatchObject({ user: { email, role: 'user' } });

  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  expect(row?.role).toBe('user');
});

it('ignores a role supplied during registration and keeps the account as user', async () => {
  const email = `spoof-role-${crypto.randomUUID()}@example.test`;
  const registerResponse = await dispatch('/v1/auth/register', 'POST', undefined, {
    name: 'Intruso',
    email,
    password: 'a secure password',
    role: 'admin',
  });
  expect(registerResponse.status).toBe(201);
  await dispatch('/v1/auth/verify-email', 'POST', undefined, { token: tokenFrom(fakeEmailSender.messages.at(-1)!) });
  const token = await accessToken(email);

  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  expect(row?.role).toBe('user');

  const createCategory = await dispatch('/v1/product-categories', 'POST', token, { name: 'Bebidas' });
  expect(createCategory.status).toBe(403);
});

it('does not let a client-supplied role bypass backend authorization', async () => {
  const token = await createAccessToken('user-a', 0, testEnv);

  const createCategory = await dispatch('/v1/product-categories', 'POST', token, { name: 'Bebidas', role: 'admin' });
  expect(createCategory.status).toBe(403);

  const createProduct = await dispatch('/v1/product-catalog', 'POST', token, { name: 'Agua', role: 'admin' });
  expect(createProduct.status).toBe(403);

  const updateProduct = await dispatch('/v1/product-catalog/prod-milk', 'PATCH', token, { name: 'Leche', role: 'admin' });
  expect(updateProduct.status).toBe(403);
});

it('does not let a user promote themselves through profile endpoints', async () => {
  const email = `self-promote-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const token = await accessToken(email);

  const patchResponse = await dispatch('/v1/me', 'PATCH', token, { firstName: 'Ana', role: 'admin' });
  expect(patchResponse.status).toBe(200);
  expect(await patchResponse.json()).toMatchObject({ user: { email, role: 'user' } });

  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  expect(row?.role).toBe('user');

  const createCategory = await dispatch('/v1/product-categories', 'POST', token, { name: 'Bebidas' });
  expect(createCategory.status).toBe(403);
});

it('does not expose a role in the password change endpoint and keeps the role unchanged', async () => {
  const email = `change-password-role-${crypto.randomUUID()}@example.test`;
  await registerAndVerify(email);
  const token = await accessToken(email);

  const changePassword = await dispatch('/v1/me/change-password', 'POST', token, { currentPassword: 'a secure password', newPassword: 'a better password', role: 'admin' });
  expect(changePassword.status).toBe(200);

  const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?').bind(email).first<{ role: string }>();
  expect(row?.role).toBe('user');
});

async function registerAndVerify(email: string): Promise<void> {
  const response = await dispatch('/v1/auth/register', 'POST', undefined, { name: 'Cris', email, password: 'a secure password' });
  expect(response.status).toBe(201);
  const verifyResponse = await dispatch('/v1/auth/verify-email', 'POST', undefined, { token: tokenFrom(fakeEmailSender.messages.at(-1)!) });
  expect(verifyResponse.status).toBe(200);
}

async function accessToken(email: string): Promise<string> {
  const response = await dispatch('/v1/auth/login', 'POST', undefined, { email, password: 'a secure password', clientType: 'web' });
  expect(response.status).toBe(200);
  const { accessToken: token } = await response.json<{ accessToken: string }>();
  return token;
}

function tokenFrom(message: EmailMessage): string {
  const match = message.text.match(/token=([^\s]+)/);
  if (!match) throw new Error('El correo no contiene un token.');
  return decodeURIComponent(match[1]);
}

async function dispatch(path: string, method = 'POST', token?: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(
    new Request(`http://local${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
