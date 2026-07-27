import { apiClient } from '../../api/session';

export type Notification = { id: string; type: string; title: string; body: string; householdId: string | null; listId: string | null; invitationId: string | null; readAt: string | null; createdAt: string };
export const notificationsQueryKey = ['notifications'] as const;
export const unreadNotificationsQueryKey = ['notifications', 'unread-count'] as const;

export async function fetchNotifications(): Promise<Notification[]> { return (await apiClient.request<{ notifications: Notification[] }>('/notifications')).notifications; }
export async function fetchUnreadCount(): Promise<number> { return (await apiClient.request<{ count: number }>('/notifications/unread-count')).count; }
export async function markNotificationRead(id: string): Promise<void> { await apiClient.request(`/notifications/${id}/read`, { method: 'PATCH' }); }
export async function markAllNotificationsRead(): Promise<void> { await apiClient.request('/notifications/read-all', { method: 'POST' }); }
