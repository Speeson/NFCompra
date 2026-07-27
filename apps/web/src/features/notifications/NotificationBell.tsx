import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationsQueryKey, type Notification, unreadNotificationsQueryKey } from './notification-api';

export function NotificationBell({ onNavigate }: { onNavigate(path: string): void }): JSX.Element {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const polling = () => document.visibilityState === 'visible' ? 30_000 : false;
  const notifications = useQuery({ queryKey: notificationsQueryKey, queryFn: fetchNotifications, refetchInterval: polling, refetchIntervalInBackground: false });
  const unread = useQuery({ queryKey: unreadNotificationsQueryKey, queryFn: fetchUnreadCount, refetchInterval: polling, refetchIntervalInBackground: false });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true }), queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey, exact: true })]);
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: () => void refresh() });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: () => void refresh() });
  const count = unread.data ?? 0;

  async function choose(notification: Notification): Promise<void> {
    if (!notification.readAt) await readOne.mutateAsync(notification.id);
    setOpen(false);
    if (notification.invitationId) onNavigate('/invitations/accept');
    else if (notification.listId && notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}&list=${encodeURIComponent(notification.listId)}`);
    else if (notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}`);
  }

  return <div className="notification-bell">
    <button type="button" aria-expanded={open} aria-label={count ? `Notificaciones (${count} sin leer)` : 'Notificaciones'} onClick={() => setOpen((value) => !value)}>Notificaciones{count ? <span aria-hidden="true"> {count}</span> : null}</button>
    {open ? <section aria-label="Panel de notificaciones">
      <button type="button" onClick={() => readAll.mutate()} disabled={!count || readAll.isPending}>Marcar todas como leídas</button>
      {notifications.isPending ? <p role="status">Cargando notificaciones…</p> : null}
      {notifications.isError ? <p role="alert">No se pudieron cargar las notificaciones.</p> : null}
      {!notifications.isPending && !notifications.isError && !notifications.data?.length ? <p>No tienes notificaciones.</p> : null}
      <ul>{notifications.data?.map((notification) => <li key={notification.id}><button type="button" onClick={() => void choose(notification)}>{notification.title}</button><p>{notification.body}</p></li>)}</ul>
    </section> : null}
  </div>;
}
