import { useEffect, useRef, useState, type JSX } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { createWebQueryClient, ShoppingListRoute } from '../features/shopping-list/ShoppingListRoute';
import { useSession } from '../features/auth/AuthProvider';
import { ForgotPasswordPage, LoginPage, ResendVerificationPage } from '../features/auth/LoginPage';
import { RegisterPage, ResetPasswordPage, VerifyEmailPage } from '../features/auth/RegisterPage';
import { AcceptInvitationPage } from '../features/invitations/AcceptInvitationPage';
import { NotificationBell } from '../features/notifications/NotificationBell';

export function App(): JSX.Element {
  const { user } = useSession();
  const clientScope = useRef<{ userId: string | null; client: ReturnType<typeof createWebQueryClient> } | null>(null);
  const userId = user?.id ?? null;
  if (!clientScope.current || clientScope.current.userId !== userId) {
    clientScope.current?.client.clear();
    clientScope.current = { userId, client: createWebQueryClient() };
  }
  return <QueryClientProvider client={clientScope.current.client}><AppRoute /></QueryClientProvider>;
}

function AppRoute(): JSX.Element {
  const [location, setLocation] = useState(() => new URL(window.location.href));
  const [logoutError, setLogoutError] = useState(false);
  const { status, user, logout } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    const updateLocation = () => setLocation(new URL(window.location.href));
    window.addEventListener('popstate', updateLocation);
    return () => window.removeEventListener('popstate', updateLocation);
  }, []);

  function navigate(path: string): void {
    window.history.pushState({}, '', path);
    setLocation(new URL(window.location.href));
  }

  useEffect(() => {
    const continuation = sessionStorage.getItem('nfcompra.invitation-continuation');
    if (status === 'authenticated' && location.pathname === '/login' && continuation?.startsWith('/invitations/accept?token=')) navigate(continuation);
  }, [location.pathname, status]);

  async function handleLogout(): Promise<void> {
    setLogoutError(false);
    queryClient.clear();
    if (!await logout()) setLogoutError(true);
  }

  if (status === 'loading') return <main><p role="status">Comprobando tu sesión…</p></main>;
  if (location.pathname === '/invitations/accept') return <AcceptInvitationPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/register') return <RegisterPage onNavigate={navigate} />;
  if (location.pathname === '/auth/verify') return <VerifyEmailPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/reset-password') return <ResetPasswordPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/forgot-password') return <ForgotPasswordPage onNavigate={navigate} />;
  if (location.pathname === '/auth/resend-verification') return <ResendVerificationPage onNavigate={navigate} />;
  if (status === 'anonymous') return <>
    {logoutError && <p role="alert">No se pudo cerrar sesión en el servidor. La sesión local se ha cerrado.</p>}
    <LoginPage onNavigate={navigate} />
  </>;

  return <>
    <header>
      <NotificationBell onNavigate={navigate} />
      <p>Sesión iniciada como {user?.name}</p>
      <button type="button" onClick={() => void handleLogout()}>Cerrar sesión</button>
    </header>
    <ShoppingListRoute currentUserId={user?.id ?? ''} />
  </>;
}
