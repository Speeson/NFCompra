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

  if (status === 'anonymous') return <AuthLayout title="Acepta tu invitación"><p>Inicia sesión con el correo invitado para continuar.</p><button type="button" onClick={() => onNavigate('/login')}>Iniciar sesión para continuar</button></AuthLayout>;
  if (!token && !invitationId) return <AuthLayout title="Acepta tu invitación"><p role="alert">Falta la invitación.</p><button type="button" onClick={() => { sessionStorage.removeItem(continuationKey); onNavigate('/'); }}>Cancelar</button></AuthLayout>;
  return <AuthLayout title="Acepta tu invitación"><p>Confirma que quieres unirte al hogar invitado.</p>{error ? <p role="alert">{error}</p> : null}<button type="button" onClick={() => { setError(undefined); accept.mutate(); }} disabled={accept.isPending}>Aceptar invitación</button><button type="button" onClick={() => { sessionStorage.removeItem(continuationKey); onNavigate('/'); }}>Cancelar</button></AuthLayout>;
}

async function apiAccept(target: { token: string } | { invitationId: string }): Promise<{ householdId: string }> {
  return 'token' in target
    ? apiClient.request('/invitations/accept', { method: 'POST', body: { token: target.token } })
    : apiClient.request(`/invitations/${encodeURIComponent(target.invitationId)}/accept`, { method: 'POST', body: {} });
}
