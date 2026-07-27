import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import { createAccessToken } from '../src/auth/token-service';
import type { Env as WorkerEnv } from '../src/env';
import { completeMissingItemOperation, completeOperation } from '../src/lists/repository';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

const worker = createWorker();
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS household_members (household_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (household_id, user_id));
    CREATE TABLE IF NOT EXISTS shopping_lists (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_lists_one_default_per_household ON shopping_lists(household_id) WHERE is_default = 1;
    CREATE TABLE IF NOT EXISTS shopping_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT NULL, category TEXT NULL, note TEXT NULL, is_checked INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_operations (operation_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, lease_token TEXT NULL, created_at TEXT NOT NULL, response_status INTEGER NOT NULL, response_body TEXT NULL);
    DELETE FROM sync_operations;
    DELETE FROM shopping_items;
    DELETE FROM shopping_lists;
    DELETE FROM household_members;
    DELETE FROM households;
    DELETE FROM users;
  `);
});

it('creates a personal household with its default list in the same response', async () => {
  const authorization = await authorizationFor('Ana');

  const response = await dispatch('/v1/households', { name: 'Casa' }, authorization);

  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({
    household: { name: 'Casa' },
    defaultList: { name: 'Compra', isDefault: true, version: 1 },
  });
});

it('lists only the caller households and allows several lists in one household', async () => {
  const ana = await authorizationFor('Ana');
  const bea = await authorizationFor('Bea');
  const created = await (await dispatch('/v1/households', { name: 'Casa' }, ana)).json<{ household: { id: string } }>();

  const createList = await dispatch(`/v1/households/${created.household.id}/lists`, { name: 'Mercado' }, ana);
  expect(createList.status).toBe(201);

  const listResponse = await dispatch(`/v1/households/${created.household.id}/lists`, undefined, ana, 'GET');
  expect(listResponse.status).toBe(200);
  expect(await listResponse.json()).toMatchObject({ lists: [{ name: 'Compra', isDefault: true }, { name: 'Mercado', isDefault: false }] });

  const householdsResponse = await dispatch('/v1/households', undefined, ana, 'GET');
  expect(await householdsResponse.json()).toMatchObject({ households: [{ id: created.household.id, name: 'Casa' }] });

  const foreignResponse = await dispatch(`/v1/households/${created.household.id}/lists`, undefined, bea, 'GET');
  expect(foreignResponse.status).toBe(403);
  expect(await foreignResponse.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
});

it('creates idempotent items and finds them by a normalized search', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const operationId = crypto.randomUUID();
  const input = { name: '  Leche   Entera ', quantity: 2, unit: 'l', operationId };

  const createdResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items`, input, authorization);
  expect(createdResponse.status).toBe(201);
  const created = await createdResponse.json<{ item: { id: string; normalizedName: string; quantity: number; version: number } }>();
  expect(created).toMatchObject({ item: { normalizedName: 'leche entera', quantity: 2, version: 1 } });

  const repeatedResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items`, input, authorization);
  expect(repeatedResponse.status).toBe(201);
  expect(await repeatedResponse.json()).toEqual(created);

  const searchResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items?search=LECHE%20ENTERA`, undefined, authorization, 'GET');
  expect(searchResponse.status).toBe(200);
  expect(await searchResponse.json()).toMatchObject({ items: [{ id: created.item.id, name: 'Leche   Entera', normalizedName: 'leche entera' }] });
});

it('updates an item only at its expected version and returns the current item on conflict', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const created = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Pan', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();

  const checkedResponse = await dispatch(`/v1/items/${created.item.id}`, { isChecked: true, expectedVersion: 1, operationId: crypto.randomUUID() }, authorization, 'PATCH');
  expect(checkedResponse.status).toBe(200);
  expect(await checkedResponse.json()).toMatchObject({ item: { id: created.item.id, isChecked: true, version: 2 } });

  const staleResponse = await dispatch(`/v1/items/${created.item.id}`, { name: 'Pan integral', expectedVersion: 1, operationId: crypto.randomUUID() }, authorization, 'PATCH');
  expect(staleResponse.status).toBe(409);
  expect(await staleResponse.json()).toMatchObject({ error: { code: 'ITEM_VERSION_CONFLICT', details: { current: { id: created.item.id, isChecked: true, version: 2 } } } });
});

it('deletes an item only at its expected version', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const created = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Huevos', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();

  const operationId = crypto.randomUUID();
  const deletedResponse = await dispatch(`/v1/items/${created.item.id}`, { expectedVersion: 1, operationId }, authorization, 'DELETE');
  expect(deletedResponse.status).toBe(200);
  expect(await deletedResponse.json()).toEqual({ status: 'deleted' });
  const repeatedResponse = await dispatch(`/v1/items/${created.item.id}`, { expectedVersion: 1, operationId }, authorization, 'DELETE');
  expect(repeatedResponse.status).toBe(200);
  expect(await repeatedResponse.json()).toEqual({ status: 'deleted' });

  const itemsResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items`, undefined, authorization, 'GET');
  expect(await itemsResponse.json()).toEqual({ items: [] });
});

it('purges only checked items from a list', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const checked = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Café', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();
  await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Arroz', operationId: crypto.randomUUID() }, authorization);
  await dispatch(`/v1/items/${checked.item.id}`, { isChecked: true, expectedVersion: 1, operationId: crypto.randomUUID() }, authorization, 'PATCH');

  const operationId = crypto.randomUUID();
  const purgeResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items/checked`, { operationId }, authorization, 'DELETE');
  expect(purgeResponse.status).toBe(200);
  expect(await purgeResponse.json()).toEqual({ removed: 1 });
  const repeatedResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items/checked`, { operationId }, authorization, 'DELETE');
  expect(repeatedResponse.status).toBe(200);
  expect(await repeatedResponse.json()).toEqual({ removed: 1 });

  const itemsResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items`, undefined, authorization, 'GET');
  expect(await itemsResponse.json()).toMatchObject({ items: [{ name: 'Arroz', isChecked: false }] });
});

it('replays concurrent updates with the same operation identifier', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const created = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Tomate', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();
  const operationId = crypto.randomUUID();

  const responses = await Promise.all([
    dispatch(`/v1/items/${created.item.id}`, { isChecked: true, expectedVersion: 1, operationId }, authorization, 'PATCH'),
    dispatch(`/v1/items/${created.item.id}`, { isChecked: true, expectedVersion: 1, operationId }, authorization, 'PATCH'),
  ]);

  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(await responses[0].json()).toEqual(await responses[1].json());
});

it('allows DELETE from an allowed browser origin', async () => {
  const response = await dispatch('/v1/lists/list/items/checked', undefined, { origin: 'http://localhost:5173' }, 'OPTIONS');

  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-methods')).toContain('DELETE');
});

it('does not reserve an operation identifier when a foreign user cannot edit an item', async () => {
  const owner = await authorizationFor('Ana');
  const foreign = await authorizationFor('Bea');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, owner)).json<{ defaultList: { id: string } }>();
  const created = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Aceite', operationId: crypto.randomUUID() }, owner)).json<{ item: { id: string } }>();
  const operationId = crypto.randomUUID();

  const forbidden = await dispatch(`/v1/items/${created.item.id}`, { isChecked: true, expectedVersion: 1, operationId }, foreign, 'PATCH');
  expect(forbidden.status).toBe(403);

  const ownerResponse = await dispatch(`/v1/items/${created.item.id}`, { isChecked: true, expectedVersion: 1, operationId }, owner, 'PATCH');
  expect(ownerResponse.status).toBe(200);
});

it('returns OPERATION_IN_PROGRESS for an unfinished item creation', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const operationId = crypto.randomUUID();
  const user = await env.DB.prepare('SELECT id FROM users ORDER BY created_at DESC LIMIT 1').first<{ id: string }>();
  await env.DB.prepare('INSERT INTO sync_operations (operation_id, user_id, created_at, response_status, response_body) VALUES (?, ?, ?, 102, NULL)')
    .bind(operationId, user!.id, new Date(Date.now() - 61_000).toISOString()).run();

  const response = await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Sal', operationId }, authorization);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: 'OPERATION_IN_PROGRESS' } });
});

it('returns OPERATION_IN_PROGRESS for unfinished PATCH, DELETE and purge operations', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const user = await env.DB.prepare('SELECT id FROM users ORDER BY created_at DESC LIMIT 1').first<{ id: string }>();
  const item = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Sal', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();
  for (const operationId of [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]) {
    await env.DB.prepare('INSERT INTO sync_operations (operation_id, user_id, lease_token, created_at, response_status, response_body) VALUES (?, ?, ?, ?, 102, NULL)')
      .bind(operationId, user!.id, crypto.randomUUID(), new Date().toISOString()).run();
  }
  const pending = await env.DB.prepare('SELECT operation_id FROM sync_operations WHERE response_status = 102 ORDER BY created_at ASC').all<{ operation_id: string }>();
  const responses = await Promise.all([
    dispatch(`/v1/items/${item.item.id}`, { isChecked: true, expectedVersion: 1, operationId: pending.results[0].operation_id }, authorization, 'PATCH'),
    dispatch(`/v1/items/${item.item.id}`, { expectedVersion: 1, operationId: pending.results[1].operation_id }, authorization, 'DELETE'),
    dispatch(`/v1/lists/${household.defaultList.id}/items/checked`, { operationId: pending.results[2].operation_id }, authorization, 'DELETE'),
  ]);
  for (const response of responses) {
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'OPERATION_IN_PROGRESS' } });
  }
});

it('does not let a duplicate DELETE close another owner pending operation', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ defaultList: { id: string } }>();
  const user = await env.DB.prepare('SELECT id FROM users ORDER BY created_at DESC LIMIT 1').first<{ id: string }>();
  const item = await (await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Sal', operationId: crypto.randomUUID() }, authorization)).json<{ item: { id: string } }>();
  const operationId = crypto.randomUUID();
  const ownerLease = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sync_operations (operation_id, user_id, lease_token, created_at, response_status, response_body) VALUES (?, ?, ?, ?, 102, NULL)')
    .bind(operationId, user!.id, ownerLease, new Date().toISOString()).run();
  await env.DB.prepare('DELETE FROM shopping_items WHERE id = ?').bind(item.item.id).run();

  const body = { expectedVersion: 1, operationId };
  const duplicate = await dispatch(`/v1/items/${item.item.id}`, body, authorization, 'DELETE');
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: { code: 'OPERATION_IN_PROGRESS' } });

  const completed = JSON.stringify({ status: 'deleted' });
  expect(await completeOperation(testEnv, operationId, user!.id, ownerLease, 200, completed)).toBe(true);
  const retry = await dispatch(`/v1/items/${item.item.id}`, body, authorization, 'DELETE');
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ status: 'deleted' });
});

it('replays the 404 stored by the lease owner after a claimed item disappears', async () => {
  const authorization = await authorizationFor('Ana');
  const user = await env.DB.prepare('SELECT id FROM users ORDER BY created_at DESC LIMIT 1').first<{ id: string }>();
  const operationId = crypto.randomUUID();
  const leaseToken = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sync_operations (operation_id, user_id, lease_token, created_at, response_status, response_body) VALUES (?, ?, ?, ?, 102, NULL)')
    .bind(operationId, user!.id, leaseToken, new Date().toISOString()).run();
  const body = JSON.stringify({ error: { code: 'ITEM_NOT_FOUND', message: 'El producto no existe.', details: {} } });
  expect(await completeMissingItemOperation(testEnv, operationId, user!.id, leaseToken, body)).toBe(true);

  const response = await dispatch(`/v1/items/${crypto.randomUUID()}`, { expectedVersion: 1, operationId }, authorization, 'DELETE');
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual(JSON.parse(body));
});

async function authorizationFor(name: string): Promise<Record<string, string>> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, `${id}@example.test`, 'hash', now, now, now).run();
  return { authorization: `Bearer ${await createAccessToken(id, testEnv)}` };
}

async function dispatch(path: string, body: unknown, headers: Record<string, string>, method = 'POST'): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch!(new Request(`http://local${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
