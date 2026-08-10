import { useEffect, useRef, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../api/client';
import {
  deleteAllNotifications,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueryKey,
  type Notification,
  unreadNotificationsQueryKey,
} from './notification-api';

export function NotificationBell({ onNavigate, onActionError }: { onNavigate(path: string): void; onActionError?(message: string): void }): JSX.Element {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);
  const polling = () => document.visibilityState === 'visible' ? 30_000 : false;
  const notifications = useQuery({ queryKey: notificationsQueryKey, queryFn: fetchNotifications, refetchInterval: polling, refetchIntervalInBackground: false });
  const unread = useQuery({ queryKey: unreadNotificationsQueryKey, queryFn: fetchUnreadCount, refetchInterval: polling, refetchIntervalInBackground: false });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey, exact: true }),
  ]);
  const reportActionError = (error: unknown) => {
    const message = error instanceof ApiError ? error.message : 'No se pudo actualizar la notificación.';
    setActionError(message);
    onActionError?.(message);
  };
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: () => void refresh(), onError: reportActionError });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: () => void refresh(), onError: reportActionError });
  const deleteAll = useMutation({ mutationFn: deleteAllNotifications, onSuccess: () => { setExpandedId(null); void refresh(); }, onError: reportActionError });
  const count = unread.data ?? 0;

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  async function choose(notification: Notification): Promise<void> {
    if (!notification.readAt) {
      try { await readOne.mutateAsync(notification.id); } catch { /* navigation remains available if marking read fails */ }
    }
    setOpen(false);
    if (notification.invitationId) onNavigate(`/invitations/${encodeURIComponent(notification.invitationId)}/accept`);
    else if (notification.listId && notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}&list=${encodeURIComponent(notification.listId)}`);
    else if (notification.householdId) onNavigate(`/?household=${encodeURIComponent(notification.householdId)}`);
  }

  return <div className="notification-bell" ref={rootRef}>
    <button className="notification-bell__trigger" type="button" aria-expanded={open} aria-label={count ? `Notificaciones (${count} sin leer)` : 'Notificaciones'} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">🔔</span>{count ? <span className="notification-bell__count" aria-hidden="true">{count}</span> : null}</button>
    {actionError ? <p role="alert">{actionError}</p> : null}
    {open ? <section className="notification-bell__panel" aria-label="Panel de notificaciones">
      <div className="notification-bell__bulk-actions">
        <button className="notification-bell__bulk-action notification-bell__bulk-action--read" type="button" onClick={() => { setActionError(undefined); readAll.mutate(); }} disabled={!count || readAll.isPending}>Marcar como leídas</button>
        <button className="notification-bell__bulk-action notification-bell__bulk-action--delete" type="button" onClick={() => { setActionError(undefined); deleteAll.mutate(); }} disabled={!notifications.data?.length || deleteAll.isPending}>Eliminar todas</button>
      </div>
      {notifications.isPending ? <p role="status">Cargando notificaciones…</p> : null}
      {notifications.isError ? <p role="alert">No se pudieron cargar las notificaciones.</p> : null}
      {!notifications.isPending && !notifications.isError && !notifications.data?.length ? <p>No tienes notificaciones.</p> : null}
      <ul>{notifications.data?.map((notification) => {
        const expanded = expandedId === notification.id;
        return <li key={notification.id} className={expanded ? 'notification-item is-expanded' : 'notification-item'}>
          <button type="button" className="notification-item__summary" aria-expanded={expanded} onClick={() => setExpandedId((current) => current === notification.id ? null : notification.id)}>
            <span><strong>{notification.title}</strong><small>{new Date(notification.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></span>
            <b aria-hidden="true">{expanded ? '−' : '+'}</b>
          </button>
          {expanded ? <div className="notification-item__detail">
            <p>{notification.body}</p>
            <div className="notification-item__actions">
              <button type="button" onClick={() => void choose(notification)}>{notification.invitationId ? 'Aceptar' : 'Abrir'}</button>
              <button type="button" onClick={() => setExpandedId(null)}>Cancelar</button>
            </div>
          </div> : null}
        </li>;
      })}</ul>
    </section> : null}
  </div>;
}
