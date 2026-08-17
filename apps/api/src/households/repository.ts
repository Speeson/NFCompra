import type { Env } from '../env';
import { deleteHouseholdCatalog } from '../catalog/repository';

export interface Household {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListSummary {
  id: string;
  householdId: string;
  name: string;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function createHousehold(env: Env, ownerId: string, name: string): Promise<{ household: Household }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, ownerId, now, now),
    env.DB.prepare("INSERT INTO household_members (household_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(id, ownerId, now),
  ]);
  return {
    household: { id, name, ownerId, createdAt: now, updatedAt: now },
  };
}

export async function listHouseholdsForUser(env: Env, userId: string): Promise<Household[]> {
  const rows = await env.DB.prepare(`
    SELECT households.id, households.name, households.owner_id, households.created_at, households.updated_at
    FROM households INNER JOIN household_members ON household_members.household_id = households.id
    WHERE household_members.user_id = ? ORDER BY households.created_at ASC
  `).bind(userId).all<{ id: string; name: string; owner_id: string; created_at: string; updated_at: string }>();
  return rows.results.map((row) => ({ id: row.id, name: row.name, ownerId: row.owner_id, createdAt: row.created_at, updatedAt: row.updated_at }));
}

export async function findHousehold(env: Env, householdId: string): Promise<Household | null> {
  const row = await env.DB.prepare('SELECT id, name, owner_id, created_at, updated_at FROM households WHERE id = ?').bind(householdId).first<{ id: string; name: string; owner_id: string; created_at: string; updated_at: string }>();
  return row ? { id: row.id, name: row.name, ownerId: row.owner_id, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export async function updateHousehold(env: Env, householdId: string, name: string): Promise<Household | null> {
  const now = new Date().toISOString();
  const row = await env.DB.prepare('UPDATE households SET name = ?, updated_at = ? WHERE id = ? RETURNING id, name, owner_id, created_at, updated_at')
    .bind(name, now, householdId).first<{ id: string; name: string; owner_id: string; created_at: string; updated_at: string }>();
  return row ? { id: row.id, name: row.name, ownerId: row.owner_id, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export async function deleteHousehold(env: Env, householdId: string): Promise<boolean> {
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM notifications WHERE household_id = ?').bind(householdId),
    env.DB.prepare('DELETE FROM invitations WHERE household_id = ?').bind(householdId),
    env.DB.prepare('DELETE FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE household_id = ?)').bind(householdId),
    env.DB.prepare('DELETE FROM shopping_lists WHERE household_id = ?').bind(householdId),
    env.DB.prepare('DELETE FROM household_members WHERE household_id = ?').bind(householdId),
    env.DB.prepare('DELETE FROM households WHERE id = ?').bind(householdId),
  ]);
  await deleteHouseholdCatalog(env, householdId);
  return results.at(-1)?.meta.changes === 1;
}

export async function isHouseholdMember(env: Env, householdId: string, userId: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM household_members WHERE household_id = ? AND user_id = ?').bind(householdId, userId).first());
}

export async function isHouseholdOwner(env: Env, householdId: string, userId: string): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM household_members WHERE household_id = ? AND user_id = ? AND role = 'owner'").bind(householdId, userId).first());
}
