import type { Env } from '../env';
import type { ShoppingListSummary } from '../households/repository';

interface ShoppingListRow {
  id: string;
  household_id: string;
  name: string;
  is_default: number;
  version: number;
  created_at: string;
  updated_at: string;
}

function mapList(row: ShoppingListRow): ShoppingListSummary {
  return { id: row.id, householdId: row.household_id, name: row.name, isDefault: row.is_default === 1, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function createShoppingList(env: Env, householdId: string, name: string): Promise<ShoppingListSummary> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO shopping_lists (id, household_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, householdId, name, now, now).run();
  return { id, householdId, name, isDefault: false, version: 1, createdAt: now, updatedAt: now };
}

export async function listShoppingLists(env: Env, householdId: string): Promise<ShoppingListSummary[]> {
  const rows = await env.DB.prepare('SELECT * FROM shopping_lists WHERE household_id = ? ORDER BY is_default DESC, created_at ASC').bind(householdId).all<ShoppingListRow>();
  return rows.results.map(mapList);
}

export interface ShoppingItem {
  id: string;
  listId: string;
  name: string;
  normalizedName: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  note: string | null;
  isChecked: boolean;
  position: number;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ShoppingItemRow {
  id: string; list_id: string; name: string; normalized_name: string; quantity: number; unit: string | null; category: string | null; note: string | null;
  is_checked: number; position: number; version: number; created_by: string; updated_by: string; created_at: string; updated_at: string;
}

function mapItem(row: ShoppingItemRow): ShoppingItem {
  return { id: row.id, listId: row.list_id, name: row.name, normalizedName: row.normalized_name, quantity: row.quantity, unit: row.unit, category: row.category, note: row.note, isChecked: row.is_checked === 1, position: row.position, version: row.version, createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function isListMember(env: Env, listId: string, userId: string): Promise<boolean> {
  return !!(await env.DB.prepare(`
    SELECT 1 FROM shopping_lists INNER JOIN household_members ON household_members.household_id = shopping_lists.household_id
    WHERE shopping_lists.id = ? AND household_members.user_id = ?
  `).bind(listId, userId).first());
}

export async function listShoppingItems(env: Env, listId: string, normalizedSearch: string | null): Promise<ShoppingItem[]> {
  const query = normalizedSearch
    ? env.DB.prepare('SELECT * FROM shopping_items WHERE list_id = ? AND normalized_name LIKE ? ORDER BY is_checked ASC, position ASC, created_at ASC').bind(listId, `%${normalizedSearch}%`)
    : env.DB.prepare('SELECT * FROM shopping_items WHERE list_id = ? ORDER BY is_checked ASC, position ASC, created_at ASC').bind(listId);
  const rows = await query.all<ShoppingItemRow>();
  return rows.results.map(mapItem);
}

async function existingOperation(env: Env, operationId: string): Promise<{ userId: string; status: number; body: string | null; leaseToken: string | null; createdAt: string } | null> {
  const row = await env.DB.prepare('SELECT user_id, response_status, response_body, lease_token, created_at FROM sync_operations WHERE operation_id = ?').bind(operationId).first<{ user_id: string; response_status: number; response_body: string | null; lease_token: string | null; created_at: string }>();
  return row ? { userId: row.user_id, status: row.response_status, body: row.response_body, leaseToken: row.lease_token, createdAt: row.created_at } : null;
}

export type OperationClaim = { state: 'claimed'; leaseToken: string } | { state: 'replay'; status: number; body: string } | { state: 'reused' } | { state: 'pending' };

async function resolveExistingOperation(env: Env, operation: string, userId: string): Promise<Exclude<OperationClaim, { state: 'claimed' }>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await existingOperation(env, operation);
    if (!current || current.userId !== userId) return { state: 'reused' };
    if (current.body) return { state: 'replay', status: current.status, body: current.body };
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  return { state: 'pending' };
}

export async function replayOperation(env: Env, operation: string, userId: string): Promise<Exclude<OperationClaim, { state: 'claimed' }> | null> {
  const current = await existingOperation(env, operation);
  if (!current) return null;
  return resolveExistingOperation(env, operation, userId);
}

export async function claimOperation(env: Env, operation: string, userId: string): Promise<OperationClaim> {
  const leaseToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO sync_operations (operation_id, user_id, lease_token, created_at, response_status, response_body) VALUES (?, ?, ?, ?, 102, NULL)')
    .bind(operation, userId, leaseToken, now).run();
  if (inserted.meta.changes === 1) return { state: 'claimed', leaseToken };
  return resolveExistingOperation(env, operation, userId);
}

export async function completeOperation(env: Env, operation: string, userId: string, leaseToken: string, status: number, body: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE sync_operations SET response_status = ?, response_body = ? WHERE operation_id = ? AND user_id = ? AND lease_token = ? AND response_body IS NULL').bind(status, body, operation, userId, leaseToken).run();
  return result.meta.changes === 1;
}

export async function completeMissingItemOperation(env: Env, operation: string, userId: string, leaseToken: string, body: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE sync_operations SET response_status = 404, response_body = ? WHERE operation_id = ? AND user_id = ? AND lease_token = ? AND response_body IS NULL')
    .bind(body, operation, userId, leaseToken).run();
  return result.meta.changes === 1;
}

export async function createShoppingItem(env: Env, input: Omit<ShoppingItem, 'id' | 'version' | 'createdAt' | 'updatedAt'>, leaseToken: string): Promise<ShoppingItem | null> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const item: ShoppingItem = { id, ...input, version: 1, createdAt: now, updatedAt: now };
  const result = await env.DB.prepare(`
    INSERT INTO shopping_items (id, list_id, name, normalized_name, quantity, unit, category, note, is_checked, position, version, created_by, updated_by, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM sync_operations WHERE lease_token = ? AND response_body IS NULL)
  `).bind(item.id, item.listId, item.name, item.normalizedName, item.quantity, item.unit, item.category, item.note, item.isChecked ? 1 : 0, item.position, item.createdBy, item.updatedBy, now, now, leaseToken).run();
  return result.meta.changes === 1 ? item : null;
}

export async function findShoppingItem(env: Env, itemId: string): Promise<ShoppingItem | null> {
  const row = await env.DB.prepare('SELECT * FROM shopping_items WHERE id = ?').bind(itemId).first<ShoppingItemRow>();
  return row ? mapItem(row) : null;
}

export type ItemPatch = Partial<Pick<ShoppingItem, 'name' | 'normalizedName' | 'quantity' | 'unit' | 'category' | 'note' | 'isChecked' | 'position'>>;

export async function updateShoppingItem(env: Env, itemId: string, expectedVersion: number, userId: string, patch: ItemPatch, leaseToken: string): Promise<ShoppingItem | null> {
  const columns: Array<[string, unknown]> = [];
  const mappings: Array<[keyof ItemPatch, string]> = [['name', 'name'], ['normalizedName', 'normalized_name'], ['quantity', 'quantity'], ['unit', 'unit'], ['category', 'category'], ['note', 'note'], ['isChecked', 'is_checked'], ['position', 'position']];
  for (const [key, column] of mappings) if (patch[key] !== undefined) columns.push([column, key === 'isChecked' ? (patch[key] ? 1 : 0) : patch[key]]);
  const now = new Date().toISOString();
  const assignments = [...columns.map(([column]) => `${column} = ?`), 'updated_by = ?', 'updated_at = ?', 'version = version + 1'];
  const row = await env.DB.prepare(`UPDATE shopping_items SET ${assignments.join(', ')} WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM sync_operations WHERE lease_token = ? AND response_body IS NULL) RETURNING *`)
    .bind(...columns.map(([, value]) => value), userId, now, itemId, expectedVersion, leaseToken).first<ShoppingItemRow>();
  return row ? mapItem(row) : null;
}

export async function deleteShoppingItem(env: Env, itemId: string, expectedVersion: number, leaseToken: string): Promise<boolean> {
  const result = await env.DB.prepare('DELETE FROM shopping_items WHERE id = ? AND version = ? AND EXISTS (SELECT 1 FROM sync_operations WHERE lease_token = ? AND response_body IS NULL)').bind(itemId, expectedVersion, leaseToken).run();
  return result.meta.changes === 1;
}

export async function deleteCheckedShoppingItems(env: Env, listId: string, leaseToken: string): Promise<number | null> {
  const lease = await env.DB.prepare('SELECT 1 FROM sync_operations WHERE lease_token = ? AND response_body IS NULL').bind(leaseToken).first();
  if (!lease) return null;
  const result = await env.DB.prepare('DELETE FROM shopping_items WHERE list_id = ? AND is_checked = 1 AND EXISTS (SELECT 1 FROM sync_operations WHERE lease_token = ? AND response_body IS NULL)').bind(listId, leaseToken).run();
  return result.meta.changes;
}
