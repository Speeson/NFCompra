import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../api/client';
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead, notificationsQueryKey, type Notification, unreadNotificationsQueryKey } from './notification-api';

export function NotificationBell({ onNavigate, onActionError }: { onNavigate(path: string): void; onActionError?(message: string): void }): JSX.Element {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const polling = () => document.visibilityState === 'visible' ? 30_000 : false;
  const notifications = useQuery({ queryKey: notificationsQueryKey, queryFn: fetchNotifications, refetchInterval: polling, refetchIntervalInBackground: false });
  const unread = useQuery({ queryKey: unreadNotificationsQueryKey, queryFn: fetchUnreadCount, refetchInterval: polling, refetchIntervalInBackground: false });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true }), queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey, exact: true })]);
  const reportActionError = (error: unknown) => {
    const message = error instanceof ApiError ? error.message : 'No se pudo actualizar la notificación.';
    setActionError(message);
    onActionError?.(message);
  };
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: () => void refresh(), onError: reportActionError });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: () => void refresh(), onError: reportActionError });
  const count = unread.data ?? 0;

  async function choose(notification: Notification): Promise<void> {
    if (!notification.readAt) {
      try { await readOne.mutateAsync(notification.id); } catch { /* navigation remains available if marking read fails */ }
    }
    setOpen(false);
    if (notification.invitationId) onNavigate(`/invitations/${encodeURIComponent(notification.invitationId)}/accept`);
    else if (notification.listId && notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}&list=${encodeURIComponent(notification.listId)}`);
    else if (notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}`);
  }

  return <div className="notification-bell">
    <button className="notification-bell__trigger" type="button" aria-expanded={open} aria-label={count ? `Notificaciones (${count} sin leer)` : 'Notificaciones'} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">🔔</span>{count ? <span className="notification-bell__count" aria-hidden="true">{count}</span> : null}</button>
    {actionError ? <p role="alert">{actionError}</p> : null}
    {open ? <section className="notification-bell__panel" aria-label="Panel de notificaciones">
      <button type="button" onClick={() => { setActionError(undefined); readAll.mutate(); }} disabled={!count || readAll.isPending}>Marcar todas como leídas</button>
      {notifications.isPending ? <p role="status">Cargando notificaciones…</p> : null}
      {notifications.isError ? <p role="alert">No se pudieron cargar las notificaciones.</p> : null}
      {!notifications.isPending && !notifications.isError && !notifications.data?.length ? <p>No tienes notificaciones.</p> : null}
      <ul>{notifications.data?.map((notification) => <li key={notification.id}><button type="button" onClick={() => void choose(notification)}>{notification.title}</button><p>{notification.body}</p></li>)}</ul>
    </section> : null}
  </div>;
}
