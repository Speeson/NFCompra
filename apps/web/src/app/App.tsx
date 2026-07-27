import { useEffect, useState, type JSX } from 'react';

import { demoShoppingItems } from '../features/shopping-list/fixtures';
import { ShoppingListScreen } from '../features/shopping-list/ShoppingListScreen';
import { useSession } from '../features/auth/AuthProvider';
import { ForgotPasswordPage, LoginPage } from '../features/auth/LoginPage';
import { RegisterPage, ResetPasswordPage, VerifyEmailPage } from '../features/auth/RegisterPage';

export function App(): JSX.Element {
  return <AppRoute />;
}

function AppRoute(): JSX.Element {
  const [location, setLocation] = useState(() => new URL(window.location.href));
  const [logoutError, setLogoutError] = useState(false);
  const { status, user, logout } = useSession();

  useEffect(() => {
    const updateLocation = () => setLocation(new URL(window.location.href));
    window.addEventListener('popstate', updateLocation);
    return () => window.removeEventListener('popstate', updateLocation);
  }, []);

  function navigate(path: string): void {
    window.history.pushState({}, '', path);
    setLocation(new URL(window.location.href));
  }

  async function handleLogout(): Promise<void> {
    setLogoutError(false);
    if (!await logout()) setLogoutError(true);
  }

  if (status === 'loading') return <main><p role="status">Comprobando tu sesión…</p></main>;
  if (location.pathname === '/register') return <RegisterPage onNavigate={navigate} />;
  if (location.pathname === '/auth/verify') return <VerifyEmailPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/reset-password') return <ResetPasswordPage token={location.searchParams.get('token')} onNavigate={navigate} />;
  if (location.pathname === '/auth/forgot-password') return <ForgotPasswordPage onNavigate={navigate} />;
  if (status === 'anonymous') return <>
    {logoutError && <p role="alert">No se pudo cerrar sesión en el servidor. La sesión local se ha cerrado.</p>}
    <LoginPage onNavigate={navigate} />
  </>;

  return <>
    <header>
      <p>Sesión iniciada como {user?.name}</p>
      <button type="button" onClick={() => void handleLogout()}>Cerrar sesión</button>
    </header>
    <ShoppingListScreen title="Mercadona" items={demoShoppingItems} isOffline={false} />
  </>;
}
