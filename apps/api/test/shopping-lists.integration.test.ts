import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createWorker } from '../src';
import { createAccessToken } from '../src/auth/token-service';
import type { Env as WorkerEnv } from '../src/env';
import type { EmailMessage, EmailSender } from '../src/email/email-sender';
import { completeMissingItemOperation, completeOperation } from '../src/lists/repository';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

interface CapturedInvitation {
  to: string;
  subject: string;
  url: string;
}

class FakeEmailSender implements EmailSender {
  messages: EmailMessage[] = [];
  invitations: CapturedInvitation[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  async sendInvitation(message: CapturedInvitation): Promise<void> {
    this.invitations.push(message);
  }
}

const fakeEmailSender = new FakeEmailSender();
const worker = createWorker(fakeEmailSender);
const testEnv: WorkerEnv = { ...env, JWT_SECRET: 'test-jwt-secret', APP_BASE_URL: 'https://nfcompra.esgarpe.dev' };
let notificationsSchemaInstalled = false;

beforeEach(async () => {
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, email_verified_at TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS household_members (household_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (household_id, user_id));
    CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, invited_email TEXT NOT NULL COLLATE NOCASE, token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT NULL, revoked_at TEXT NULL, invited_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_active_household_email ON invitations(household_id, invited_email) WHERE status = 'pending';
    CREATE TABLE IF NOT EXISTS shopping_lists (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_lists_one_default_per_household ON shopping_lists(household_id) WHERE is_default = 1;
    CREATE TABLE IF NOT EXISTS shopping_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT NULL, category TEXT NULL, note TEXT NULL, is_checked INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_operations (operation_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, lease_token TEXT NULL, created_at TEXT NOT NULL, response_status INTEGER NOT NULL, response_body TEXT NULL);
    DELETE FROM sync_operations;
    DELETE FROM shopping_items;
    DELETE FROM shopping_lists;
    DELETE FROM household_members;
    DELETE FROM invitations;
    DELETE FROM households;
    DELETE FROM users;
  `);
  if (!notificationsSchemaInstalled) {
    const migrations = (env as unknown as { TEST_MIGRATIONS: Array<{ name: string; queries: string[] }> }).TEST_MIGRATIONS;
    const migration = migrations.find(({ name }) => name.startsWith('0006_notifications'));
    if (!migration) throw new Error('No se ha encontrado la migración de notificaciones.');
    await env.DB.batch(migration.queries.map((query) => env.DB.prepare(query)));
    notificationsSchemaInstalled = true;
  }
  await env.DB.exec('DELETE FROM notifications;');
  fakeEmailSender.messages = [];
  fakeEmailSender.invitations = [];
});

it('manages the invitation lifecycle without persisting raw tokens or exposing owner data to members', async () => {
  const owner = await verifiedUser('Ana');
  const invited = await verifiedUser('Bea');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, owner.headers)).json<{ household: { id: string } }>();
  const now = new Date().toISOString();

  await env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)")
    .bind(household.household.id, invited.id, now).run();
  const memberCannotInvite = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: 'tercera@example.test' }, invited.headers);
  expect(memberCannotInvite.status).toBe(403);
  await env.DB.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').bind(household.household.id, invited.id).run();

  const created = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: ` ${invited.email.toUpperCase()} ` }, owner.headers);
  expect(created.status).toBe(201);
  const firstInvitation = await created.json<{ invitation: { id: string; email: string; status: string } }>();
  expect(firstInvitation.invitation).toMatchObject({ email: invited.email, status: 'pending' });
  expect(fakeEmailSender.invitations).toHaveLength(1);
  expect(fakeEmailSender.invitations[0]).toMatchObject({ to: invited.email, subject: 'Invitacion a un hogar de NFCompra' });
  expect(fakeEmailSender.invitations[0].url).toContain('https://nfcompra.esgarpe.dev/invitations/accept?token=');
  const firstToken = tokenFromUrl(fakeEmailSender.invitations[0].url);
  expect(await env.DB.prepare('SELECT token_hash FROM invitations WHERE id = ?').bind(firstInvitation.invitation.id).first<{ token_hash: string }>())
    .not.toEqual({ token_hash: firstToken });

  const wrongAccount = await dispatch('/v1/invitations/accept', { token: firstToken }, owner.headers);
  expect(wrongAccount.status).toBe(403);
  expect(await wrongAccount.json()).toMatchObject({ error: { code: 'INVITATION_EMAIL_MISMATCH' } });

  const renewed = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: invited.email }, owner.headers);
  expect(renewed.status).toBe(201);
  const renewedInvitation = await renewed.json<{ invitation: { id: string; expiresAt: string } }>();
  expect(renewedInvitation.invitation.id).toBe(firstInvitation.invitation.id);
  const renewedToken = tokenFromUrl(fakeEmailSender.invitations[1].url);
  const invalidated = await dispatch('/v1/invitations/accept', { token: firstToken }, invited.headers);
  expect(invalidated.status).toBe(400);
  expect(await invalidated.json()).toMatchObject({ error: { code: 'INVALID_INVITATION_TOKEN' } });

  const accepted = await dispatch('/v1/invitations/accept', { token: renewedToken }, invited.headers);
  expect(accepted.status).toBe(200);
  expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id = ? AND user_id = ? AND role = 'member'")
    .bind(household.household.id, invited.id).first<{ count: number }>()).toEqual({ count: 1 });
  const consumed = await dispatch('/v1/invitations/accept', { token: renewedToken }, invited.headers);
  expect(consumed.status).toBe(400);
  expect(await consumed.json()).toMatchObject({ error: { code: 'INVITATION_ALREADY_ACCEPTED' } });

  const memberCannotListInvitations = await dispatch(`/v1/households/${household.household.id}/invitations`, undefined, invited.headers, 'GET');
  expect(memberCannotListInvitations.status).toBe(403);
  const memberReadMembers = await dispatch(`/v1/households/${household.household.id}/members`, undefined, invited.headers, 'GET');
  expect(memberReadMembers.status).toBe(200);
  expect(await memberReadMembers.json()).toMatchObject({ members: [{ userId: owner.id, role: 'owner' }, { userId: invited.id, role: 'member' }] });
  const members = await dispatch(`/v1/households/${household.household.id}/members`, undefined, owner.headers, 'GET');
  expect(await members.json()).toMatchObject({ members: [{ userId: owner.id, role: 'owner' }, { userId: invited.id, role: 'member' }] });

  const revoked = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: 'revoked@example.test' }, owner.headers);
  const revokedInvitation = await revoked.json<{ invitation: { id: string } }>();
  const revokedToken = tokenFromUrl(fakeEmailSender.invitations.at(-1)!.url);
  const revocation = await dispatch(`/v1/households/${household.household.id}/invitations/${revokedInvitation.invitation.id}`, undefined, owner.headers, 'DELETE');
  expect(revocation.status).toBe(200);
  const revokedAcceptance = await dispatch('/v1/invitations/accept', { token: revokedToken }, invited.headers);
  expect(revokedAcceptance.status).toBe(400);
  expect(await revokedAcceptance.json()).toMatchObject({ error: { code: 'INVITATION_REVOKED' } });

  const expired = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: 'expired@example.test' }, owner.headers);
  expect(expired.status).toBe(201);
  const expiredInvitation = await expired.json<{ invitation: { id: string } }>();
  const expiredToken = tokenFromUrl(fakeEmailSender.invitations.at(-1)!.url);
  await env.DB.prepare('UPDATE invitations SET expires_at = ? WHERE id = ?')
    .bind(new Date(Date.now() - 60_000).toISOString(), expiredInvitation.invitation.id).run();
  const expiredAcceptance = await dispatch('/v1/invitations/accept', { token: expiredToken }, invited.headers);
  expect(expiredAcceptance.status).toBe(400);
  expect(await expiredAcceptance.json()).toMatchObject({ error: { code: 'INVITATION_EXPIRED' } });

  const cannotRemoveSelf = await dispatch(`/v1/households/${household.household.id}/members/${owner.id}`, undefined, owner.headers, 'DELETE');
  expect(cannotRemoveSelf.status).toBe(409);
  expect(await cannotRemoveSelf.json()).toMatchObject({ error: { code: 'CANNOT_REMOVE_SELF' } });
  const removed = await dispatch(`/v1/households/${household.household.id}/members/${invited.id}`, undefined, owner.headers, 'DELETE');
  expect(removed.status).toBe(200);
  expect(await removed.json()).toEqual({ status: 'removed' });
});

it('accepts a notification-linked invitation by id only for its verified recipient', async () => {
  const owner = await verifiedUser('Ana');
  const invited = await verifiedUser('Bea');
  const other = await verifiedUser('Cora');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, owner.headers)).json<{ household: { id: string } }>();
  const created = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: invited.email }, owner.headers);
  const { invitation } = await created.json<{ invitation: { id: string } }>();

  const wrongRecipient = await dispatch(`/v1/invitations/${invitation.id}/accept`, {}, other.headers);
  expect(wrongRecipient.status).toBe(403);
  expect(await wrongRecipient.json()).toMatchObject({ error: { code: 'INVITATION_EMAIL_MISMATCH' } });
  const accepted = await dispatch(`/v1/invitations/${invitation.id}/accept`, {}, invited.headers);
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ householdId: household.household.id, invitation: { id: invitation.id, status: 'accepted' } });
});

it('keeps the end-to-end shared flow usable without exposing the emailed invitation token in JSON', async () => {
  // This catches a regression that returns the externally delivered token from any API response.
  const owner = await verifiedUser('Ana');
  const invited = await verifiedUser('Bea');
  const responseBodies: string[] = [];
  const capture = async (response: Response): Promise<Response> => {
    responseBodies.push(await response.clone().text());
    return response;
  };

  const householdResponse = await capture(await dispatch('/v1/households', { name: 'Casa compartida' }, owner.headers));
  expect(householdResponse.status).toBe(201);
  const household = await householdResponse.json<{ household: { id: string }; defaultList: { id: string } }>();

  const invitationResponse = await capture(await dispatch(`/v1/households/${household.household.id}/invitations`, { email: invited.email }, owner.headers));
  expect(invitationResponse.status).toBe(201);
  const { invitation } = await invitationResponse.json<{ invitation: { id: string; status: string } }>();
  expect(invitation.status).toBe('pending');
  const rawToken = tokenFromUrl(fakeEmailSender.invitations.at(-1)!.url);

  const acceptanceResponse = await capture(await dispatch('/v1/invitations/accept', { token: rawToken }, invited.headers));
  expect(acceptanceResponse.status).toBe(200);
  expect(await acceptanceResponse.json()).toMatchObject({ householdId: household.household.id, invitation: { id: invitation.id, status: 'accepted' } });

  const itemResponse = await capture(await dispatch(`/v1/lists/${household.defaultList.id}/items`, { name: 'Pan', operationId: crypto.randomUUID() }, owner.headers));
  expect(itemResponse.status).toBe(201);
  const item = await itemResponse.json<{ item: { id: string; name: string } }>();

  const memberItemsResponse = await capture(await dispatch(`/v1/lists/${household.defaultList.id}/items`, undefined, invited.headers, 'GET'));
  expect(memberItemsResponse.status).toBe(200);
  expect(await memberItemsResponse.json()).toMatchObject({ items: [{ id: item.item.id, name: 'Pan' }] });

  const memberNotificationsResponse = await capture(await dispatch('/v1/notifications?limit=50', undefined, invited.headers, 'GET'));
  expect(memberNotificationsResponse.status).toBe(200);
  expect(await memberNotificationsResponse.json()).toMatchObject({ notifications: expect.arrayContaining([expect.objectContaining({ type: 'item_created', householdId: household.household.id, listId: household.defaultList.id })]) });

  const ownerNotificationsResponse = await capture(await dispatch('/v1/notifications?limit=50', undefined, owner.headers, 'GET'));
  expect(ownerNotificationsResponse.status).toBe(200);
  expect(await ownerNotificationsResponse.json()).toMatchObject({ notifications: expect.arrayContaining([expect.objectContaining({ type: 'invitation_accepted', invitationId: invitation.id, householdId: household.household.id })]) });

  for (const body of responseBodies) expect(body).not.toContain(rawToken);
});

it('notifies only relevant users about sharing and grouped remote list activity', async () => {
  const owner = await verifiedUser('Ana');
  const invited = await verifiedUser('Bea');
  const member = await verifiedUser('Cora');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, owner.headers)).json<{ household: { id: string }; defaultList: { id: string } }>();

  const invitationResponse = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: invited.email }, owner.headers);
  expect(invitationResponse.status).toBe(201);
  const invitation = await invitationResponse.json<{ invitation: { id: string } }>();
  expect(await notifications(invited.headers)).toMatchObject({ notifications: [{ type: 'invitation_received', invitationId: invitation.invitation.id, householdId: household.household.id, readAt: null }] });
  expect(await unreadCount(owner.headers)).toBe(0);

  const inviteToken = tokenFromUrl(fakeEmailSender.invitations.at(-1)!.url);
  expect((await dispatch('/v1/invitations/accept', { token: inviteToken }, invited.headers)).status).toBe(200);
  expect(await notifications(owner.headers)).toMatchObject({ notifications: [{ type: 'invitation_accepted', invitationId: invitation.invitation.id, householdId: household.household.id }] });

  expect((await dispatch(`/v1/households/${household.household.id}/members/${invited.id}`, undefined, owner.headers, 'DELETE')).status).toBe(200);
  expect(await notifications(invited.headers)).toMatchObject({ notifications: expect.arrayContaining([expect.objectContaining({ type: 'member_removed', householdId: household.household.id })]) });

  const memberInvitation = await dispatch(`/v1/households/${household.household.id}/invitations`, { email: member.email }, owner.headers);
  const memberToken = tokenFromUrl(fakeEmailSender.invitations.at(-1)!.url);
  expect(memberInvitation.status).toBe(201);
  expect((await dispatch('/v1/invitations/accept', { token: memberToken }, member.headers)).status).toBe(200);
  expect((await dispatch('/v1/notifications/read-all', {}, member.headers)).status).toBe(200);
  expect((await dispatch('/v1/notifications/read-all', {}, owner.headers)).status).toBe(200);

  const createOperationId = crypto.randomUUID();
  const itemRequest = { name: 'Pan', operationId: createOperationId };
  const createdResponse = await dispatch(`/v1/lists/${household.defaultList.id}/items`, itemRequest, owner.headers);
  const item = await createdResponse.json<{ item: { id: string; version: number } }>();
  expect((await dispatch(`/v1/lists/${household.defaultList.id}/items`, itemRequest, owner.headers)).status).toBe(201);
  expect((await dispatch(`/v1/items/${item.item.id}`, { name: 'Pan integral', expectedVersion: item.item.version, operationId: crypto.randomUUID() }, owner.headers, 'PATCH')).status).toBe(200);
  expect((await dispatch(`/v1/items/${item.item.id}`, { quantity: 2, expectedVersion: item.item.version + 1, operationId: crypto.randomUUID() }, owner.headers, 'PATCH')).status).toBe(200);
  expect((await dispatch(`/v1/items/${item.item.id}`, { isChecked: true, expectedVersion: item.item.version + 2, operationId: crypto.randomUUID() }, owner.headers, 'PATCH')).status).toBe(200);
  expect((await dispatch(`/v1/items/${item.item.id}`, { note: 'Comprar hoy', expectedVersion: item.item.version + 3, operationId: crypto.randomUUID() }, member.headers, 'PATCH')).status).toBe(200);
  expect(await unreadCount(owner.headers)).toBe(1);
  expect((await dispatch(`/v1/items/${item.item.id}`, { expectedVersion: item.item.version + 4, operationId: crypto.randomUUID() }, owner.headers, 'DELETE')).status).toBe(200);

  const memberNotifications = await notifications(member.headers);
  expect(memberNotifications.notifications.filter(({ type }) => type === 'item_updated')).toHaveLength(1);
  expect(memberNotifications.notifications.map(({ type }) => type)).toEqual(expect.arrayContaining(['item_created', 'item_updated', 'item_checked', 'item_deleted']));
  expect(await unreadCount(owner.headers)).toBe(1);

  const anotherList = await (await dispatch(`/v1/households/${household.household.id}/lists`, { name: 'Mercado' }, owner.headers)).json<{ list: { id: string } }>();
  expect((await dispatch(`/v1/lists/${anotherList.list.id}/items`, { name: 'Leche', operationId: crypto.randomUUID() }, owner.headers)).status).toBe(201);
  const afterOtherList = await notifications(member.headers);
  expect(afterOtherList.notifications.filter(({ type }) => type === 'item_created')).toHaveLength(2);

  const listed = await notifications(member.headers);
  const unreadNotification = listed.notifications.find(({ readAt }) => readAt === null);
  expect(unreadNotification).toBeDefined();
  const firstId = unreadNotification!.id;
  const beforeRead = await unreadCount(member.headers);
  expect((await dispatch(`/v1/notifications/${firstId}/read`, {}, member.headers, 'PATCH')).status).toBe(200);
  expect(await unreadCount(member.headers)).toBe(beforeRead - 1);
  expect((await dispatch('/v1/notifications/read-all', {}, member.headers)).status).toBe(200);
  expect(await unreadCount(member.headers)).toBe(0);
  expect((await dispatch(`/v1/notifications/${firstId}/read`, {}, owner.headers, 'PATCH')).status).toBe(404);
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

it('renames and deletes non-default lists with idempotent list operations', async () => {
  const authorization = await authorizationFor('Ana');
  const household = await (await dispatch('/v1/households', { name: 'Casa' }, authorization)).json<{ household: { id: string }; defaultList: { id: string; version: number } }>();
  const created = await (await dispatch(`/v1/households/${household.household.id}/lists`, { name: 'Mercado' }, authorization)).json<{ list: { id: string; version: number } }>();

  const renameOperationId = crypto.randomUUID();
  const renameBody = { name: 'Mercadona', expectedVersion: created.list.version, operationId: renameOperationId };
  const renamedResponse = await dispatch(`/v1/lists/${created.list.id}`, renameBody, authorization, 'PATCH');
  expect(renamedResponse.status).toBe(200);
  const renamed = await renamedResponse.json<{ list: { id: string; name: string; version: number } }>();
  expect(renamed).toMatchObject({ list: { id: created.list.id, name: 'Mercadona', version: 2 } });
  const repeatedRename = await dispatch(`/v1/lists/${created.list.id}`, renameBody, authorization, 'PATCH');
  expect(repeatedRename.status).toBe(200);
  expect(await repeatedRename.json()).toEqual(renamed);

  const staleRename = await dispatch(`/v1/lists/${created.list.id}`, { name: 'Otra', expectedVersion: 1, operationId: crypto.randomUUID() }, authorization, 'PATCH');
  expect(staleRename.status).toBe(409);
  expect(await staleRename.json()).toMatchObject({ error: { code: 'LIST_VERSION_CONFLICT', details: { current: { name: 'Mercadona', version: 2 } } } });

  const defaultDelete = await dispatch(`/v1/lists/${household.defaultList.id}`, { expectedVersion: household.defaultList.version, operationId: crypto.randomUUID() }, authorization, 'DELETE');
  expect(defaultDelete.status).toBe(409);
  expect(await defaultDelete.json()).toMatchObject({ error: { code: 'DEFAULT_LIST_CANNOT_BE_DELETED' } });

  const deleteOperationId = crypto.randomUUID();
  const deleteBody = { expectedVersion: 2, operationId: deleteOperationId };
  const deletedResponse = await dispatch(`/v1/lists/${created.list.id}`, deleteBody, authorization, 'DELETE');
  expect(deletedResponse.status).toBe(200);
  expect(await deletedResponse.json()).toEqual({ status: 'deleted' });
  const repeatedDelete = await dispatch(`/v1/lists/${created.list.id}`, deleteBody, authorization, 'DELETE');
  expect(repeatedDelete.status).toBe(200);
  expect(await repeatedDelete.json()).toEqual({ status: 'deleted' });

  const listsResponse = await dispatch(`/v1/households/${household.household.id}/lists`, undefined, authorization, 'GET');
  expect(await listsResponse.json()).toMatchObject({ lists: [{ id: household.defaultList.id, name: 'Compra' }] });
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
  return { authorization: `Bearer ${await createAccessToken(id, 0, testEnv)}` };
}

async function verifiedUser(name: string): Promise<{ id: string; email: string; headers: Record<string, string> }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = `${id}@example.test`;
  await env.DB.prepare('INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, email, 'hash', now, now, now).run();
  return { id, email, headers: { authorization: `Bearer ${await createAccessToken(id, 0, testEnv)}` } };
}

function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('La invitacion no contiene un token.');
  return token;
}

async function notifications(headers: Record<string, string>): Promise<{ notifications: Array<{ id: string; type: string; householdId: string | null; invitationId: string | null; actorUserId?: string; readAt: string | null }> }> {
  const response = await dispatch('/v1/notifications?limit=50', undefined, headers, 'GET');
  expect(response.status).toBe(200);
  return response.json();
}

async function unreadCount(headers: Record<string, string>): Promise<number> {
  const response = await dispatch('/v1/notifications/unread-count', undefined, headers, 'GET');
  expect(response.status).toBe(200);
  return (await response.json<{ count: number }>()).count;
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
