import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../api/client';
import { apiClient } from '../../api/session';
import { useSession } from '../auth/AuthProvider';
import { AuthLayout } from '../auth/LoginPage';
import { notificationsQueryKey, unreadNotificationsQueryKey } from '../notifications/notification-api';
import { householdQueryKey } from '../shopping-list/queries';

const continuationKey = 'nfcompra.invitation-continuation';

export function AcceptInvitationPage({ token, invitationId, onNavigate }: { token: string | null; invitationId?: string | null; onNavigate(path: string): void }): JSX.Element {
  const { status } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const accept = useMutation({
    mutationFn: () => {
      if (token) return apiAccept({ token });
      if (invitationId) return apiAccept({ invitationId });
      throw new Error('Falta la invitación.');
    },
    onSuccess: async ({ householdId }) => {
      sessionStorage.removeItem(continuationKey);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: householdQueryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey, exact: true }),
      ]);
      onNavigate(`/?household=${encodeURIComponent(householdId)}`);
    },
    onError: (cause) => setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'No se pudo aceptar la invitación.'),
  });

  useEffect(() => {
    if (status !== 'anonymous' || (!token && !invitationId)) return;
    sessionStorage.setItem(continuationKey, token ? `/invitations/accept?token=${encodeURIComponent(token)}` : `/invitations/${encodeURIComponent(invitationId!)}/accept`);
  }, [invitationId, status, token]);

  if (status === 'anonymous') return (
    <AuthLayout title="Acepta tu invitación">
      <div className="invitation-card">
        <p className="invitation-message">Inicia sesión con el correo invitado para continuar.</p>
        <button type="button" className="button-primary" onClick={() => onNavigate('/login')}>Iniciar sesión para continuar</button>
      </div>
    </AuthLayout>
  );

  if (!token && !invitationId) return (
    <AuthLayout title="Invitación no disponible">
      <div className="invitation-card">
        <p role="alert" className="invitation-error">Falta la invitación o el enlace no es válido.</p>
        <button type="button" className="button-secondary" onClick={() => { sessionStorage.removeItem(continuationKey); onNavigate('/'); }}>Volver al inicio</button>
      </div>
    </AuthLayout>
  );

  return (
    <AuthLayout title="Acepta tu invitación">
      <div className="invitation-card">
        <div className="invitation-icon">🏠</div>
        <p className="invitation-message">Has sido invitado a unirte a un hogar en NFCompra. Al aceptar, podrás ver y gestionar las listas de compra compartidas.</p>
        {error ? <p role="alert" className="invitation-error">{error}</p> : null}
        {accept.isPending ? (
          <p className="invitation-loading">Aceptando invitación…</p>
        ) : (
          <button type="button" className="button-primary" onClick={() => { setError(undefined); accept.mutate(); }}>Aceptar invitación</button>
        )}
        <button type="button" className="button-secondary" onClick={() => { sessionStorage.removeItem(continuationKey); onNavigate('/'); }}>Cancelar</button>
      </div>
    </AuthLayout>
  );
}

async function apiAccept(target: { token: string } | { invitationId: string }): Promise<{ householdId: string }> {
  return 'token' in target
    ? apiClient.request('/invitations/accept', { method: 'POST', body: { token: target.token } })
    : apiClient.request(`/invitations/${encodeURIComponent(target.invitationId)}/accept`, { method: 'POST', body: {} });
}
