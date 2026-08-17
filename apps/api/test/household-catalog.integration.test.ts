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

interface Fixture {
  admin: string;
  userA: string;
  userB: string;
  userC: string;
  householdOne: string;
  householdTwo: string;
  systemCategory: string;
  systemProduct: string;
  h2Category: string;
  h2Product: string;
}

let fixture: Fixture;

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, first_name TEXT NULL, last_name TEXT NULL, birth_date TEXT NULL, username TEXT UNIQUE COLLATE NOCASE NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')), email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, otp_hash TEXT NULL UNIQUE, otp_attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, used_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, device_name TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS household_members (household_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (household_id, user_id));
    CREATE TABLE IF NOT EXISTS product_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, parent_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', source TEXT NULL, source_category_id TEXT NULL, scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household')), household_id TEXT NULL, created_by TEXT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_scope_name ON product_categories(scope, COALESCE(household_id, ''), normalized_name);
    CREATE TABLE IF NOT EXISTS product_catalog (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, category_id TEXT NULL, icon_key TEXT NOT NULL DEFAULT 'shopping-basket', brand TEXT NULL, package_size TEXT NULL, source TEXT NULL, source_product_id TEXT NULL, scope TEXT NOT NULL DEFAULT 'system' CHECK(scope IN ('system', 'household')), household_id TEXT NULL, created_by TEXT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS product_aliases (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_product_favorites (user_id TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (user_id, product_id));
    DELETE FROM user_product_favorites;
    DELETE FROM product_aliases;
    DELETE FROM product_catalog;
    DELETE FROM product_categories;
    DELETE FROM household_members;
    DELETE FROM households;
    DELETE FROM refresh_tokens;
    DELETE FROM auth_tokens;
    DELETE FROM users;
  `);
  fakeEmailSender.messages = [];
  fakeEmailSender.failure = null;
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, role, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('admin-a', 'Admin', 'admin@example.test', 'hash', 'admin', now, now, now).run();
  for (const [id, name, email] of [['user-a', 'Ana', 'ana@example.test'], ['user-b', 'Bea', 'bea@example.test'], ['user-c', 'Cris', 'cris@example.test']]) {
    await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, email, 'hash', now, now, now).run();
  }
  const h1 = 'household-one';
  const h2 = 'household-two';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(h1, 'Hogar Uno', 'user-a', now, now),
    env.DB.prepare('INSERT INTO households (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(h2, 'Hogar Dos', 'user-c', now, now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(h1, 'user-a', now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)").bind(h1, 'user-b', now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(h2, 'user-c', now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(h2, 'user-a', now),
  ]);
  await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('sys-cat', 'Lacteos', 'lacteos', 'system', null, 'milk', now, now).run();
  await env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, scope, household_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('sys-prod', 'Leche entera', 'leche entera', 'sys-cat', 'milk', 'system', null, 1, now, now).run();
  await env.DB.prepare('INSERT INTO product_categories (id, name, normalized_name, scope, household_id, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('h2-cat', 'Vinos', 'vinos', 'household', h2, 'wine', now, now).run();
  await env.DB.prepare('INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, scope, household_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind('h2-prod', 'Leche de coco', 'leche de coco', 'h2-cat', 'milk', 'household', h2, 1, now, now).run();
  fixture = {
    admin: 'admin-a',
    userA: 'user-a',
    userB: 'user-b',
    userC: 'user-c',
    householdOne: h1,
    householdTwo: h2,
    systemCategory: 'sys-cat',
    systemProduct: 'sys-prod',
    h2Category: 'h2-cat',
    h2Product: 'h2-prod',
  };
});

it('keeps system catalog mutations admin-only', async () => {
  const normal = await createAccessToken(fixture.userB, 0, testEnv);

  const createCategory = await dispatch('/v1/product-categories', 'POST', normal, { name: 'Congelados' });
  expect(createCategory.status).toBe(403);
  const updateCategory = await dispatch(`/v1/product-categories/${fixture.systemCategory}`, 'PATCH', normal, { name: 'Lacteos frescos' });
  expect(updateCategory.status).toBe(403);
  const deleteCategory = await dispatch(`/v1/product-categories/${fixture.systemCategory}`, 'DELETE', normal);
  expect(deleteCategory.status).toBe(403);
  const createProduct = await dispatch('/v1/product-catalog', 'POST', normal, { name: 'Pan integral' });
  expect(createProduct.status).toBe(403);
  const updateProduct = await dispatch(`/v1/product-catalog/${fixture.systemProduct}`, 'PATCH', normal, { name: 'Leche semidesnatada' });
  expect(updateProduct.status).toBe(403);
  const deleteProduct = await dispatch(`/v1/product-catalog/${fixture.systemProduct}`, 'DELETE', normal);
  expect(deleteProduct.status).toBe(403);

  const admin = await createAccessToken(fixture.admin, 0, testEnv);
  const adminCreate = await dispatch('/v1/product-categories', 'POST', admin, { name: 'Congelados' });
  expect(adminCreate.status).toBe(201);
});

it('lets household members create household categories and products with server-validated householdId', async () => {
  const member = await createAccessToken(fixture.userB, 0, testEnv);

  const categoryResponse = await dispatch(`/v1/households/${fixture.householdOne}/product-categories`, 'POST', member, { name: 'Bebidas', iconKey: 'drink' });
  expect(categoryResponse.status).toBe(201);
  const category = await categoryResponse.json() as { category: { id: string; scope: string; householdId: string | null; permissions?: { canEdit: boolean } } };
  expect(category.category.scope).toBe('household');
  expect(category.category.householdId).toBe(fixture.householdOne);
  expect(category.category.permissions).toEqual({ canEdit: true, canDelete: true });

  const productResponse = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', member, {
    name: 'Leche de avena', categoryId: 'sys-cat', iconKey: 'milk', brand: 'Alpro', packageSize: '1 L',
  });
  expect(productResponse.status).toBe(201);
  const product = await productResponse.json() as { product: { id: string; scope: string; householdId: string | null; categoryName: string | null } };
  expect(product.product.scope).toBe('household');
  expect(product.product.householdId).toBe(fixture.householdOne);
  expect(product.product.categoryName).toBe('Lacteos');

  const missingHousehold = await dispatch('/v1/households/nope/product-categories', 'POST', member, { name: 'X' });
  expect(missingHousehold.status).toBe(404);
  expect((await missingHousehold.json())).toMatchObject({ error: { code: 'HOUSEHOLD_NOT_FOUND' } });

  const outsider = await createAccessToken(fixture.userC, 0, testEnv);
  const forbidden = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', outsider, { name: 'Hack' });
  expect(forbidden.status).toBe(403);
});

it('lets another member edit and delete household products and categories collaboratively', async () => {
  const creator = await createAccessToken(fixture.userB, 0, testEnv);
  const collaborator = await createAccessToken(fixture.userA, 0, testEnv);

  const createdProduct = await (await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', creator, { name: 'Miel del huerto', categoryId: 'sys-cat' })).json() as { product: { id: string } };
  const updated = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog/${createdProduct.product.id}`, 'PATCH', collaborator, { name: 'Miel del huerto 2', packageSize: '500 g' });
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({ product: { id: createdProduct.product.id, name: 'Miel del huerto 2' } });

  const createdCategory = await (await dispatch(`/v1/households/${fixture.householdOne}/product-categories`, 'POST', creator, { name: 'Dulces' })).json() as { category: { id: string } };
  const updatedCategory = await dispatch(`/v1/households/${fixture.householdOne}/product-categories/${createdCategory.category.id}`, 'PATCH', collaborator, { name: 'Dulces y miel' });
  expect(updatedCategory.status).toBe(200);

  const deletedProduct = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog/${createdProduct.product.id}`, 'DELETE', collaborator);
  expect(deletedProduct.status).toBe(200);
  const deletedCategory = await dispatch(`/v1/households/${fixture.householdOne}/product-categories/${createdCategory.category.id}`, 'DELETE', creator);
  expect(deletedCategory.status).toBe(200);
});

it('enforces household isolation for reads, mutations and favorites', async () => {
  const userB = await createAccessToken(fixture.userB, 0, testEnv);
  const userA = await createAccessToken(fixture.userA, 0, testEnv);

  const readCategories = await dispatch(`/v1/product-categories?householdId=${fixture.householdTwo}`, 'GET', userB);
  expect(readCategories.status).toBe(403);
  const readSnapshot = await dispatch(`/v1/product-catalog/snapshot?householdId=${fixture.householdTwo}`, 'GET', userB);
  expect(readSnapshot.status).toBe(403);

  const patchH2 = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog/${fixture.h2Product}`, 'PATCH', userB, { name: 'Leche cambiada' });
  expect(patchH2.status).toBe(404);
  const patchViaH2 = await dispatch(`/v1/households/${fixture.householdTwo}/product-catalog/${fixture.h2Product}`, 'PATCH', userB, { name: 'Leche cambiada' });
  expect(patchViaH2.status).toBe(403);
  const deleteH2 = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog/${fixture.h2Product}`, 'DELETE', userB);
  expect(deleteH2.status).toBe(404);

  const patchCategory = await dispatch(`/v1/households/${fixture.householdOne}/product-categories/${fixture.h2Category}`, 'PATCH', userB, { name: 'Vinos raros' });
  expect(patchCategory.status).toBe(404);

  const crossCategoryProduct = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', userB, { name: 'Cava', categoryId: fixture.h2Category });
  expect(crossCategoryProduct.status).toBe(400);
  expect(await crossCategoryProduct.json()).toMatchObject({ error: { code: 'CATEGORY_SCOPE_MISMATCH' } });

  const crossHouseholdParent = await dispatch(`/v1/households/${fixture.householdOne}/product-categories`, 'POST', userB, { name: 'Bodega', parentId: fixture.h2Category });
  expect(crossHouseholdParent.status).toBe(400);
  expect(await crossHouseholdParent.json()).toMatchObject({ error: { code: 'CATEGORY_SCOPE_MISMATCH' } });

  const favoriteH2 = await dispatch(`/v1/product-catalog/${fixture.h2Product}/favorite`, 'POST', userB);
  expect(favoriteH2.status).toBe(403);

  const admin = await createAccessToken(fixture.admin, 0, testEnv);
  const systemProductWithHouseholdCategory = await dispatch('/v1/product-catalog', 'POST', admin, { name: 'Producto sistema', categoryId: fixture.h2Category });
  expect(systemProductWithHouseholdCategory.status).toBe(400);

  const sameHouseholdCategoryParent = await dispatch(`/v1/households/${fixture.householdOne}/product-categories`, 'POST', userA, { name: 'Bodega local', parentId: fixture.h2Category });
  expect(sameHouseholdCategoryParent.status).toBe(400);
});

it('merges system and current-household products into the same search without leaking other households', async () => {
  const member = await createAccessToken(fixture.userB, 0, testEnv);
  await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', member, { name: 'Leche de cabra', categoryId: 'sys-cat', iconKey: 'milk' });

  const search = await dispatch(`/v1/product-catalog?search=leche&householdId=${fixture.householdOne}`, 'GET', member);
  expect(search.status).toBe(200);
  const { products } = await search.json() as { products: Array<{ id: string; name: string; scope: string }> };
  expect(products.some((product) => product.id === 'sys-prod')).toBe(true);
  expect(products.some((product) => product.name === 'Leche de cabra')).toBe(true);
  expect(products.some((product) => product.id === 'h2-prod')).toBe(false);

  const searchWithoutHousehold = await dispatch('/v1/product-catalog?search=leche', 'GET', member);
  const systemOnly = await searchWithoutHousehold.json() as { products: Array<{ id: string; name: string }> };
  expect(systemOnly.products.some((product) => product.id === 'h2-prod')).toBe(false);
  expect(systemOnly.products.some((product) => product.name === 'Leche de cabra')).toBe(false);
  expect(systemOnly.products.some((product) => product.id === 'sys-prod')).toBe(true);

  const snapshot = await dispatch(`/v1/product-catalog/snapshot?householdId=${fixture.householdOne}`, 'GET', member);
  expect(snapshot.status).toBe(200);
  const snapshotBody = await snapshot.json() as { productCount: number; products: Array<{ id: string; name: string }> };
  expect(snapshotBody.products.some((product) => product.id === 'sys-prod')).toBe(true);
  expect(snapshotBody.products.some((product) => product.name === 'Leche de cabra')).toBe(true);
  expect(snapshotBody.products.some((product) => product.id === 'h2-prod')).toBe(false);
  expect(snapshotBody.productCount).toBe(2);

  const categories = await dispatch(`/v1/product-categories?householdId=${fixture.householdOne}`, 'GET', member);
  const categoryBody = await categories.json() as { categories: Array<{ id: string }> };
  expect(categoryBody.categories.some((category) => category.id === 'sys-cat')).toBe(true);
  expect(categoryBody.categories.some((category) => category.id === 'h2-cat')).toBe(false);
});

it('applies favorite ranking to household products and keeps them accessible to members', async () => {
  const member = await createAccessToken(fixture.userB, 0, testEnv);
  const created = await (await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', member, { name: 'Leche de avena', categoryId: 'sys-cat' })).json() as { product: { id: string } };

  const addFavorite = await dispatch(`/v1/product-catalog/${created.product.id}/favorite`, 'POST', member);
  expect(addFavorite.status).toBe(200);
  const removeFavorite = await dispatch(`/v1/product-catalog/${created.product.id}/favorite`, 'DELETE', member);
  expect(removeFavorite.status).toBe(200);

  const addAgain = await dispatch(`/v1/product-catalog/${created.product.id}/favorite`, 'POST', member);
  expect(addAgain.status).toBe(200);
  const search = await dispatch(`/v1/product-catalog?search=leche&householdId=${fixture.householdOne}`, 'GET', member);
  const { products } = await search.json() as { products: Array<{ id: string; isFavorite: boolean }> };
  const favoriteProduct = products.find((product) => product.id === created.product.id);
  expect(favoriteProduct?.isFavorite).toBe(true);
  expect(products[0].id).toBe(created.product.id);

  const deleted = await dispatch(`/v1/households/${fixture.householdOne}/product-catalog/${created.product.id}`, 'DELETE', member);
  expect(deleted.status).toBe(200);
  const favorites = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_product_favorites WHERE product_id = ?').bind(created.product.id).first<{ count: number }>();
  expect(favorites?.count).toBe(0);
});

it('revokes access to household products for former members through favorites and reads', async () => {
  const member = await createAccessToken(fixture.userB, 0, testEnv);
  const created = await (await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', member, { name: 'Agua de coco', categoryId: 'sys-cat' })).json() as { product: { id: string } };
  await dispatch(`/v1/product-catalog/${created.product.id}/favorite`, 'POST', member);

  await env.DB.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').bind(fixture.householdOne, fixture.userB).run();

  const favoriteAfterLeave = await dispatch(`/v1/product-catalog/${created.product.id}/favorite`, 'DELETE', member);
  expect(favoriteAfterLeave.status).toBe(403);
  const snapshotAfterLeave = await dispatch(`/v1/product-catalog/snapshot?householdId=${fixture.householdOne}`, 'GET', member);
  expect(snapshotAfterLeave.status).toBe(403);
  const searchAfterLeave = await dispatch(`/v1/product-catalog?search=agua&householdId=${fixture.householdOne}`, 'GET', member);
  expect(searchAfterLeave.status).toBe(403);
});

it('isolates household versioning so other households do not see foreign changes as global changes', async () => {
  const member = await createAccessToken(fixture.userB, 0, testEnv);
  const outsider = await createAccessToken(fixture.userC, 0, testEnv);

  const systemVersionBefore = await (await dispatch('/v1/product-catalog/version', 'GET')).json() as { version: string };
  await dispatch(`/v1/households/${fixture.householdOne}/product-catalog`, 'POST', member, { name: 'Nuevo producto de H1', categoryId: 'sys-cat' });

  const systemVersionAfter = await (await dispatch('/v1/product-catalog/version', 'GET')).json() as { version: string };
  expect(systemVersionAfter.version).toBe(systemVersionBefore.version);

  const h1Version = await (await dispatch(`/v1/product-catalog/version?householdId=${fixture.householdOne}`, 'GET', member)).json() as { version: string; productCount: number };
  expect(h1Version.productCount).toBe(2);
  const h2Version = await (await dispatch(`/v1/product-catalog/version?householdId=${fixture.householdTwo}`, 'GET', outsider)).json() as { productCount: number };
  expect(h2Version.productCount).toBe(2);
});

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
