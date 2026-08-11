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
import { HouseholdsPage } from '../features/households/HouseholdsPage';
import { ListsPage } from '../features/shopping-list/ListsPage';
import { CatalogPage } from '../features/catalog/CatalogPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import type { User } from '../api/session';

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

  useEffect(() => {
    const intentUrl = androidIntentUrlForHouseholdLink(location.pathname, location.href, navigator.userAgent);
    if (!intentUrl) return;
    const storageKey = `nfcompra.android-intent-attempt:${location.pathname}`;
    if (sessionStorage.getItem(storageKey) === '1') return;
    sessionStorage.setItem(storageKey, '1');
    window.location.href = intentUrl;
  }, [location.href, location.pathname]);

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
    <AuthenticatedRoute pathname={location.pathname} search={location.searchParams} user={user!} onNavigate={navigate} />
  </AppShell>;
}

export function androidIntentUrlForHouseholdLink(pathname: string, href: string, userAgent: string): string | null {
  if (!/Android/i.test(userAgent)) return null;
  const householdListsMatch = pathname.match(/^\/household\/([^/]+)\/lists$/);
  if (!householdListsMatch) return null;
  return `intent://household/${householdListsMatch[1]}/lists#Intent;scheme=nfcompra;package=dev.esgarpe.nfcompra;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

export function AuthenticatedRoute({ pathname, search, user, onNavigate }: { pathname: string; search: URLSearchParams; user: User; onNavigate(path: string): void }): JSX.Element {
  const userId = user.id;
  const householdMatch = pathname.match(/^\/households\/([^/]+)$/);
  const householdListsMatch = pathname.match(/^\/household\/([^/]+)\/lists$/);
  const listMatch = pathname.match(/^\/lists\/([^/]+)$/);
  if (pathname === '/' && !search.has('household') && !search.has('list')) return <DashboardPage userName={user.name} onNavigate={onNavigate} />;
  if (pathname === '/households') return <HouseholdsPage currentUserId={userId} onNavigate={onNavigate} startCreating={search.get('create') === '1'} />;
  if (householdMatch) return <ListsPage onNavigate={onNavigate} selectedHouseholdId={decodeURIComponent(householdMatch[1])} />;
  if (householdListsMatch) return <ListsPage onNavigate={onNavigate} selectedHouseholdId={decodeURIComponent(householdListsMatch[1])} />;
  if (pathname === '/lists') return <ListsPage onNavigate={onNavigate} startCreating={search.get('create') === '1'} selectedHouseholdId={search.get('household')} />;
  if (listMatch) return <ShoppingListRoute currentUserId={userId} requestedListId={decodeURIComponent(listMatch[1])} onNavigate={onNavigate} />;
  if (pathname === '/catalog') return <CatalogPage />;
  if (pathname === '/profile') return <ProfilePage user={user} onNavigate={onNavigate} />;
  if (pathname === '/settings') return <PlaceholderPage title="Ajustes" text="Los ajustes de la cuenta estarán disponibles aquí próximamente." />;
  return <ShoppingListRoute currentUserId={userId} requestedHouseholdId={search.get('household')} requestedListId={search.get('list')} onNavigate={onNavigate} />;
}

function PlaceholderPage({ title, text }: { title: string; text: string }): JSX.Element { return <section className="route-page"><p className="eyebrow">Cuenta</p><h1>{title}</h1><p className="route-page__empty">{text}</p></section>; }
