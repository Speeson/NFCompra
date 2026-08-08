import type { Env } from '../env';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  householdId: string | null;
  listId: string | null;
  invitationId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationInput {
  householdId: string;
  type: string;
  title: string;
  body: string;
  actorUserId?: string;
  listId?: string;
  invitationId?: string;
  recipientUserIds?: string[];
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  household_id: string | null;
  list_id: string | null;
  invitation_id: string | null;
  read_at: string | null;
  created_at: string;
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    householdId: row.household_id,
    listId: row.list_id,
    invitationId: row.invitation_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function notifyUsers(env: Env, input: NotificationInput): Promise<void> {
  const recipients = input.recipientUserIds
    ? [...new Set(input.recipientUserIds)]
    : (await env.DB.prepare('SELECT user_id FROM household_members WHERE household_id = ?').bind(input.householdId).all<{ user_id: string }>()).results.map(({ user_id }) => user_id);
  const now = new Date();
  const nowIso = now.toISOString();
  const groupedUntil = input.listId && input.actorUserId ? new Date(now.getTime() + 5 * 60 * 1000).toISOString() : null;
  for (const userId of recipients) {
    if (userId === input.actorUserId) continue;
    if (groupedUntil) {
      const groupKey = `${userId}:${input.actorUserId}:${input.listId}:${input.type}`;
      await env.DB.prepare('UPDATE notifications SET group_key = NULL, updated_at = ? WHERE group_key = ? AND (read_at IS NOT NULL OR grouped_until < ?)')
        .bind(nowIso, groupKey, nowIso).run();
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, invitation_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
        ON CONFLICT(group_key) WHERE group_key IS NOT NULL DO UPDATE SET title = excluded.title, body = excluded.body, grouped_until = excluded.grouped_until, updated_at = excluded.updated_at
        WHERE notifications.read_at IS NULL AND notifications.grouped_until >= excluded.created_at
      `).bind(crypto.randomUUID(), userId, input.type, input.title, input.body, input.householdId, input.listId, input.invitationId ?? null, input.actorUserId, groupedUntil, groupKey, nowIso, nowIso).run();
      continue;
    }
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, household_id, list_id, invitation_id, actor_user_id, read_at, grouped_until, group_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
    `).bind(crypto.randomUUID(), userId, input.type, input.title, input.body, input.householdId, input.listId ?? null, input.invitationId ?? null, input.actorUserId ?? null, groupedUntil, nowIso, nowIso).run();
  }
}

export async function listNotifications(env: Env, userId: string, limit: number): Promise<Notification[]> {
  const rows = await env.DB.prepare(`
    SELECT id, type, title, body, household_id, list_id, invitation_id, read_at, created_at
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
  `).bind(userId, limit).all<NotificationRow>();
  return rows.results.map(mapNotification);
}

export async function unreadNotificationCount(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(userId).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function markNotificationRead(env: Env, notificationId: string, userId: string): Promise<boolean> {
  const result = await env.DB.prepare('UPDATE notifications SET read_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL')
    .bind(new Date().toISOString(), new Date().toISOString(), notificationId, userId).run();
  if (result.meta.changes === 1) return true;
  return !!(await env.DB.prepare('SELECT 1 FROM notifications WHERE id = ? AND user_id = ?').bind(notificationId, userId).first());
}

export async function markAllNotificationsRead(env: Env, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE notifications SET read_at = ?, updated_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, now, userId).run();
}

export async function deleteAllNotifications(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(userId).run();
}

export async function deleteNotification(env: Env, notificationId: string, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(notificationId, userId).run();
}
