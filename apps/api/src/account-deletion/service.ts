import type { Env } from '../env';

export interface DeletedUser {
  id: string;
  email: string;
}

export interface HouseholdDeletionAction {
  householdId: string;
  householdName: string;
  action: 'transfer' | 'delete';
  successorUserId: string | null;
  successorEmail: string | null;
}

export interface AccountDeletionImpact {
  user: DeletedUser;
  ownedHouseholds: number;
  memberships: number;
  refreshTokens: number;
  authTokens: number;
  syncOperations: number;
  notifications: number;
  invitationsSent: number;
  invitationsInOwnedHouseholds: number;
  nfcLinksCreated: number;
  nfcLinksInOwnedHouseholds: number;
  shoppingItemsCreated: number;
  shoppingItemsUpdated: number;
  favorites: number;
  householdActions: HouseholdDeletionAction[];
}

interface OwnedHouseholdRow {
  id: string;
  name: string;
}

interface SuccessorRow {
  user_id: string;
  email: string;
}

type CountKey = keyof Omit<AccountDeletionImpact, 'user' | 'householdActions'>;

export const ACCOUNT_DELETION_COUNT_SQL: Record<CountKey, string> = {
  ownedHouseholds: 'SELECT COUNT(*) AS count FROM households WHERE owner_id = ?',
  memberships: 'SELECT COUNT(*) AS count FROM household_members WHERE user_id = ?',
  refreshTokens: 'SELECT COUNT(*) AS count FROM refresh_tokens WHERE user_id = ?',
  authTokens: 'SELECT COUNT(*) AS count FROM auth_tokens WHERE user_id = ?',
  syncOperations: 'SELECT COUNT(*) AS count FROM sync_operations WHERE user_id = ?',
  notifications: 'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? OR actor_user_id = ?',
  invitationsSent: 'SELECT COUNT(*) AS count FROM invitations WHERE invited_by = ?',
  invitationsInOwnedHouseholds: 'SELECT COUNT(*) AS count FROM invitations WHERE household_id IN (SELECT id FROM households WHERE owner_id = ?)',
  nfcLinksCreated: 'SELECT COUNT(*) AS count FROM nfc_links WHERE created_by = ?',
  nfcLinksInOwnedHouseholds: 'SELECT COUNT(*) AS count FROM nfc_links WHERE household_id IN (SELECT id FROM households WHERE owner_id = ?)',
  shoppingItemsCreated: 'SELECT COUNT(*) AS count FROM shopping_items WHERE created_by = ?',
  shoppingItemsUpdated: 'SELECT COUNT(*) AS count FROM shopping_items WHERE updated_by = ?',
  favorites: 'SELECT COUNT(*) AS count FROM user_product_favorites WHERE user_id = ?',
};

export function accountDeletionMutationSql(plan: AccountDeletionImpact, now: string): Array<{ sql: string; params: unknown[] }> {
  const targetUserId = plan.user.id;
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  for (const action of plan.householdActions.filter((item) => item.action === 'transfer')) {
    statements.push({ sql: 'UPDATE households SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?', params: [action.successorUserId, now, action.householdId, targetUserId] });
    statements.push({ sql: "UPDATE household_members SET role = 'owner' WHERE household_id = ? AND user_id = ?", params: [action.householdId, action.successorUserId] });
  }
  statements.push({ sql: 'DELETE FROM notifications WHERE user_id = ? OR actor_user_id = ?', params: [targetUserId, targetUserId] });
  statements.push({ sql: 'DELETE FROM invitations WHERE invited_by = ?', params: [targetUserId] });
  statements.push({ sql: 'UPDATE nfc_links SET created_by = ?, updated_at = ? WHERE created_by = ?', params: [null, now, targetUserId] });
  statements.push({ sql: 'UPDATE shopping_items SET created_by = ? WHERE created_by = ?', params: [null, targetUserId] });
  statements.push({ sql: 'UPDATE shopping_items SET updated_by = ? WHERE updated_by = ?', params: [null, targetUserId] });
  statements.push({ sql: 'UPDATE product_catalog SET created_by = ? WHERE created_by = ?', params: [null, targetUserId] });
  statements.push({ sql: 'UPDATE product_categories SET created_by = ? WHERE created_by = ?', params: [null, targetUserId] });
  for (const action of plan.householdActions.filter((item) => item.action === 'delete')) {
    statements.push({ sql: 'DELETE FROM notifications WHERE household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM invitations WHERE household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM nfc_links WHERE household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM shopping_items WHERE list_id IN (SELECT id FROM shopping_lists WHERE household_id = ?)', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM shopping_lists WHERE household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM household_members WHERE household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM user_product_favorites WHERE product_id IN (SELECT id FROM product_catalog WHERE scope = \'household\' AND household_id = ?)', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM product_catalog WHERE scope = \'household\' AND household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM product_categories WHERE scope = \'household\' AND household_id = ?', params: [action.householdId] });
    statements.push({ sql: 'DELETE FROM households WHERE id = ? AND owner_id = ?', params: [action.householdId, targetUserId] });
  }
  statements.push({ sql: 'DELETE FROM household_members WHERE user_id = ?', params: [targetUserId] });
  statements.push({ sql: 'DELETE FROM users WHERE id = ?', params: [targetUserId] });
  return statements;
}

export class AccountDeletionService {
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async plan(userId: string): Promise<AccountDeletionImpact | null> {
    const user = await this.env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(userId).first<DeletedUser>();
    if (!user) return null;
    const owned = await this.env.DB.prepare('SELECT id, name FROM households WHERE owner_id = ? ORDER BY created_at ASC, id ASC').bind(userId).all<OwnedHouseholdRow>();
    const householdActions: HouseholdDeletionAction[] = [];
    for (const household of owned.results) {
      const successor = await this.env.DB.prepare(`
        SELECT household_members.user_id, users.email
        FROM household_members
        JOIN users ON users.id = household_members.user_id
        WHERE household_members.household_id = ?
          AND household_members.user_id <> ?
          AND household_members.role IN ('owner', 'member')
        ORDER BY household_members.created_at ASC, household_members.user_id ASC
        LIMIT 1
      `).bind(household.id, userId).first<SuccessorRow>();
      householdActions.push({
        householdId: household.id,
        householdName: household.name,
        action: successor ? 'transfer' : 'delete',
        successorUserId: successor?.user_id ?? null,
        successorEmail: successor?.email ?? null,
      });
    }
    const counts = Object.fromEntries(await Promise.all(
      (Object.entries(ACCOUNT_DELETION_COUNT_SQL) as Array<[CountKey, string]>).map(async ([key, sql]) => {
        const params = key === 'notifications' ? [userId, userId] : [userId];
        const row = await this.env.DB.prepare(sql).bind(...params).first<{ count: number }>();
        return [key, row?.count ?? 0];
      }),
    )) as Record<CountKey, number>;
    return { user, ...counts, householdActions };
  }

  async delete(userId: string): Promise<AccountDeletionImpact | null> {
    const plan = await this.plan(userId);
    if (!plan) return null;
    const now = new Date().toISOString();
    await this.env.DB.batch(accountDeletionMutationSql(plan, now).map(({ sql, params }) => this.env.DB.prepare(sql).bind(...params)));
    return plan;
  }
}
