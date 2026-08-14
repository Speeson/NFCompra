import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/account-deletion/service';
import { hashPassword } from '../src/auth/password-hasher';
import { createAccessToken } from '../src/auth/token-service';
import { createWorker } from '../src';
import type { Env as WorkerEnv } from '../src/env';

interface Migration {
  name: string;
  queries: string[];
}

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: Migration[];
      WRANGLER_NOTIFICATION_MIGRATION: string;
    }
  }
}

const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'http://app.test' };
const worker = createWorker();
const password = 'a secure password';

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 5));
  await env.DB.exec(env.WRANGLER_NOTIFICATION_MIGRATION);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(6));
});

beforeEach(async () => {
  await env.DB.exec(`
    DELETE FROM user_product_favorites;
    DELETE FROM product_aliases;
    DELETE FROM product_catalog;
    DELETE FROM product_categories;
    DELETE FROM notifications;
    DELETE FROM invitations;
    DELETE FROM nfc_links;
    DELETE FROM shopping_items;
    DELETE FROM shopping_lists;
    DELETE FROM household_members;
    DELETE FROM households;
    DELETE FROM sync_operations;
    DELETE FROM refresh_tokens;
    DELETE FROM auth_tokens;
    DELETE FROM users;
  `);
});

it('dry-run planning finds member-only impact without mutating data', async () => {
  const owner = await user('owner-member-only@example.test');
  const target = await user('member-only@example.test');
  const first = await household('shared-1', 'Casa', owner.id);
  const second = await household('shared-2', 'Costa', owner.id);
  await member(first.id, target.id, 'member', '2026-01-02T00:00:00.000Z');
  await member(second.id, target.id, 'member', '2026-01-03T00:00:00.000Z');

  const impact = await new AccountDeletionService(testEnv).plan(target.id);

  expect(impact).toMatchObject({ user: { id: target.id, email: target.email }, memberships: 2, ownedHouseholds: 0 });
  expect(impact?.householdActions).toEqual([]);
  expect(await count('users')).toBe(2);
  expect(await count('household_members')).toBe(4);
});

it('removes ordinary members while keeping shared households', async () => {
  const owner = await user('owner-ordinary@example.test');
  const target = await user('ordinary@example.test');
  const first = await household('ordinary-shared-1', 'Casa', owner.id);
  const second = await household('ordinary-shared-2', 'Costa', owner.id);
  await member(first.id, target.id, 'member', '2026-01-02T00:00:00.000Z');
  await member(second.id, target.id, 'member', '2026-01-03T00:00:00.000Z');

  await new AccountDeletionService(testEnv).delete(target.id);

  expect(await count('users', 'id = ?', target.id)).toBe(0);
  expect(await count('households')).toBe(2);
  expect(await count('household_members', 'user_id = ?', target.id)).toBe(0);
  await expectForeignKeysOk();
});

it('transfers owned households to the longest-standing active member and deletes owner-only households', async () => {
  const target = await user('owner-delete@example.test');
  const older = await user('older@example.test');
  const newer = await user('newer@example.test');
  const invited = await user('pending-only@example.test');
  const transferred = await household('transfer-home', 'Costa Marina 3', target.id);
  const deleted = await household('delete-home', 'Casa pruebas', target.id);
  await member(transferred.id, newer.id, 'member', '2026-01-05T00:00:00.000Z');
  await member(transferred.id, older.id, 'member', '2026-01-02T00:00:00.000Z');
  await invitation('invite-pending', transferred.id, invited.email, target.id);
  const transferredList = await list('list-transfer', transferred.id);
  const deletedList = await list('list-delete', deleted.id);
  await item('item-transfer', transferredList.id, target.id);
  await item('item-delete', deletedList.id, target.id);
  await nfcLink('nfc-transfer', transferred.id, target.id);
  await nfcLink('nfc-delete', deleted.id, target.id);
  await tokenRows(target.id);

  const impact = await new AccountDeletionService(testEnv).delete(target.id);

  expect(impact?.householdActions).toEqual([
    expect.objectContaining({ householdId: transferred.id, action: 'transfer', successorUserId: older.id, successorEmail: older.email }),
    expect.objectContaining({ householdId: deleted.id, action: 'delete', successorUserId: null }),
  ]);
  expect(await env.DB.prepare('SELECT owner_id FROM households WHERE id = ?').bind(transferred.id).first<{ owner_id: string }>()).toEqual({ owner_id: older.id });
  expect(await count('households', 'id = ?', deleted.id)).toBe(0);
  expect(await env.DB.prepare('SELECT created_by, updated_by FROM shopping_items WHERE id = ?').bind('item-transfer').first()).toEqual({ created_by: null, updated_by: null });
  expect(await env.DB.prepare('SELECT created_by FROM nfc_links WHERE id = ?').bind('nfc-transfer').first()).toEqual({ created_by: null });
  expect(await count('shopping_items', 'id = ?', 'item-delete')).toBe(0);
  expect(await count('refresh_tokens', 'user_id = ?', target.id)).toBe(0);
  expect(await count('auth_tokens', 'user_id = ?', target.id)).toBe(0);
  expect(await count('sync_operations', 'user_id = ?', target.id)).toBe(0);
  expect(await count('users', 'id = ?', target.id)).toBe(0);
  await expectForeignKeysOk();
});

it('uses user id as deterministic tie-breaker when membership timestamps match', async () => {
  const target = await user('tie-owner@example.test');
  const b = await user('bbb-member@example.test', 'bbbbbbbb-0000-4000-8000-000000000000');
  const a = await user('aaa-member@example.test', 'aaaaaaaa-0000-4000-8000-000000000000');
  const owned = await household('tie-home', 'Tie', target.id);
  await member(owned.id, b.id, 'member', '2026-01-02T00:00:00.000Z');
  await member(owned.id, a.id, 'member', '2026-01-02T00:00:00.000Z');

  await new AccountDeletionService(testEnv).delete(target.id);

  expect(await env.DB.prepare('SELECT owner_id FROM households WHERE id = ?').bind(owned.id).first<{ owner_id: string }>()).toEqual({ owner_id: a.id });
  await expectForeignKeysOk();
});

it('rejects incorrect current password without deleting data', async () => {
  const target = await user('wrong-password@example.test', undefined, await hashPassword(password));
  const headers = { authorization: `Bearer ${await createAccessToken(target.id, 0, testEnv)}` };

  const response = await dispatch('/v1/me', { currentPassword: 'wrong password' }, headers, 'DELETE');

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: 'INVALID_CURRENT_PASSWORD' } });
  expect(await count('users', 'id = ?', target.id)).toBe(1);
});

it('self-deletes with current password and rejects the previous access token', async () => {
  const target = await user('self-delete@example.test', undefined, await hashPassword(password));
  const accessToken = await createAccessToken(target.id, 0, testEnv);
  const owned = await household('self-delete-home', 'Solo', target.id);
  await list('self-delete-list', owned.id);

  const response = await dispatch('/v1/me', { currentPassword: password }, { authorization: `Bearer ${accessToken}` }, 'DELETE');
  const later = await dispatch('/v1/me', undefined, { authorization: `Bearer ${accessToken}` }, 'GET');

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'deleted' });
  expect(later.status).toBe(401);
  expect(await count('users', 'id = ?', target.id)).toBe(0);
  await expectForeignKeysOk();
});

async function user(email: string, id = crypto.randomUUID(), passwordHash = 'hash'): Promise<{ id: string; email: string }> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users (id, name, first_name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email.split('@')[0], email.split('@')[0], email, passwordHash, now, now, now).run();
  return { id, email };
}

async function household(id: string, name: string, ownerId: string): Promise<{ id: string; name: string }> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, ownerId, now, now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(id, ownerId, now),
  ]);
  return { id, name };
}

async function member(householdId: string, userId: string, role: 'owner' | 'member', createdAt: string): Promise<void> {
  await env.DB.prepare('INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
    .bind(householdId, userId, role, createdAt).run();
}

async function invitation(id: string, householdId: string, invitedEmail: string, invitedBy: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO invitations (id, household_id, invited_email, token_hash, status, expires_at, invited_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
    .bind(id, householdId, invitedEmail, id, new Date(Date.now() + 86_400_000).toISOString(), invitedBy, now, now).run();
}

async function list(id: string, householdId: string): Promise<{ id: string }> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO shopping_lists (id, household_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, householdId, id, now, now).run();
  return { id };
}

async function item(id: string, listId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO shopping_items (id, list_id, name, normalized_name, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, listId, id, id, userId, userId, now, now).run();
}

async function nfcLink(id: string, householdId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO nfc_links (id, public_code, household_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, id, householdId, userId, now, now).run();
}

async function tokenRows(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ('refresh', ?, 'refresh-hash', ?, ?)").bind(userId, new Date(Date.now() + 86_400_000).toISOString(), now),
    env.DB.prepare("INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_at) VALUES ('auth', ?, 'password_reset', 'auth-hash', ?, ?)").bind(userId, new Date(Date.now() + 86_400_000).toISOString(), now),
    env.DB.prepare("INSERT INTO sync_operations (operation_id, user_id, created_at, response_status) VALUES ('sync', ?, ?, 200)").bind(userId, now),
  ]);
}

async function count(table: string, where = '1 = 1', value?: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).bind(...(value === undefined ? [] : [value])).first<{ count: number }>();
  return row?.count ?? 0;
}

async function expectForeignKeysOk(): Promise<void> {
  const check = await env.DB.prepare('PRAGMA foreign_key_check').all();
  expect(check.results).toEqual([]);
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
