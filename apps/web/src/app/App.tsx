import { useEffect, useRef, useState, type JSX } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { createWebQueryClient, ShoppingListRoute } from '../features/shopping-list/ShoppingListRoute';
import { useSession } from '../features/auth/AuthProvider';
import { ForgotPasswordPage, LoginPage, ResendVerificationPage } from '../features/auth/LoginPage';
import { RegisterPage, ResetPasswordPage, VerifyEmailPage } from '../features/auth/RegisterPage';
import { AcceptInvitationPage } from '../features/invitations/AcceptInvitationPage';
import { PublicLanding } from '../features/landing/PublicLanding';
import { AuthModal, type AuthMode } from '../features/auth/AuthModal';
import { AppShell } from '../features/app-shell/AppShell';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { HouseholdDetailPage, HouseholdsPage } from '../features/households/HouseholdsPage';
import { ListsPage } from '../features/shopping-list/ListsPage';
import { NfcPage } from '../features/nfc/NfcPage';

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
  const [notificationActionError, setNotificationActionError] = useState<string>();
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const authTriggerRef = useRef<HTMLElement | null>(null);
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

  function openAuth(mode: AuthMode): void {
    authTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthMode(mode);
  }

  function closeAuth(): void {
    setAuthMode(null);
    requestAnimationFrame(() => authTriggerRef.current?.focus());
  }

  const notificationActionAlert = notificationActionError ? <p role="alert">
    {notificationActionError}
    <button type="button" onClick={() => setNotificationActionError(undefined)}>Cerrar aviso</button>
  </p> : null;

  useEffect(() => {
    const continuation = sessionStorage.getItem('nfcompra.invitation-continuation');
    if (status === 'authenticated' && location.pathname === '/login' && continuation?.startsWith('/invitations/')) navigate(continuation);
  }, [location.pathname, status]);

  async function handleLogout(): Promise<void> {
    setLogoutError(false);
    queryClient.clear();
    if (!await logout()) setLogoutError(true);
  }

  if (status === 'loading') return <main><p role="status">Comprobando tu sesión…</p></main>;
  if (location.pathname === '/invitations/accept') return <AcceptInvitationPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  const notificationInvitation = location.pathname.match(/^\/invitations\/([^/]+)\/accept$/);
  if (notificationInvitation) return <>{notificationActionAlert}<AcceptInvitationPage token={null} invitationId={notificationInvitation[1]} onNavigate={navigate} /></>;
  if (location.pathname === '/register') return <RegisterPage onNavigate={navigate} />;
  if (location.pathname === '/auth/verify') return <VerifyEmailPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/reset-password') return <ResetPasswordPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/forgot-password') return <ForgotPasswordPage onNavigate={navigate} />;
  if (location.pathname === '/auth/resend-verification') return <ResendVerificationPage onNavigate={navigate} />;
  if (status === 'anonymous' && location.pathname === '/') return <>
    {logoutError && <p role="alert">No se pudo cerrar sesión en el servidor. La sesión local se ha cerrado.</p>}
    <PublicLanding onOpenAuth={openAuth} />
    {authMode && <AuthModal mode={authMode} onClose={closeAuth} onSwitch={setAuthMode} onNavigate={navigate} />}
  </>;
  if (status === 'anonymous') return <>
    {logoutError && <p role="alert">No se pudo cerrar sesión en el servidor. La sesión local se ha cerrado.</p>}
    <LoginPage onNavigate={navigate} />
  </>;

  return <AppShell user={user!} pathname={location.pathname} onNavigate={navigate} onLogout={handleLogout} onNotificationActionError={setNotificationActionError}>
    {notificationActionAlert}
    <AuthenticatedRoute pathname={location.pathname} search={location.searchParams} userId={user?.id ?? ''} userName={user?.name ?? ''} onNavigate={navigate} />
  </AppShell>;
}

export function AuthenticatedRoute({ pathname, search, userId, userName, onNavigate }: { pathname: string; search: URLSearchParams; userId: string; userName: string; onNavigate(path: string): void }): JSX.Element {
  const householdMatch = pathname.match(/^\/households\/([^/]+)$/);
  const listMatch = pathname.match(/^\/lists\/([^/]+)$/);
  if (pathname === '/' && !search.has('household') && !search.has('list')) return <DashboardPage userName={userName} onNavigate={onNavigate} />;
  if (pathname === '/households') return <HouseholdsPage onNavigate={onNavigate} />;
  if (householdMatch) return <HouseholdDetailPage householdId={decodeURIComponent(householdMatch[1])} currentUserId={userId} onNavigate={onNavigate} />;
  if (pathname === '/lists') return <ListsPage onNavigate={onNavigate} />;
  if (listMatch) return <ShoppingListRoute currentUserId={userId} requestedListId={decodeURIComponent(listMatch[1])} />;
  if (pathname === '/nfc') return <NfcPage />;
  if (pathname === '/profile') return <PlaceholderPage title="Perfil" text="Tu perfil se mostrará aquí cuando haya ajustes guardados disponibles." />;
  if (pathname === '/settings') return <PlaceholderPage title="Ajustes" text="Los ajustes de la cuenta estarán disponibles aquí próximamente." />;
  return <ShoppingListRoute currentUserId={userId} requestedHouseholdId={search.get('household')} requestedListId={search.get('list')} />;
}

function PlaceholderPage({ title, text }: { title: string; text: string }): JSX.Element { return <section className="route-page"><p className="eyebrow">Cuenta</p><h1>{title}</h1><p className="route-page__empty">{text}</p></section>; }
