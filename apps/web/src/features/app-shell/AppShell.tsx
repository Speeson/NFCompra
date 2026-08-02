import { useEffect, useRef, useState, type JSX, type PropsWithChildren } from 'react';

import logo from '../../assets/brand/nfcompra-logo.png';
import type { User } from '../../api/session';
import { NotificationBell } from '../notifications/NotificationBell';

interface AppShellProps extends PropsWithChildren {
  user: User;
  pathname: string;
  onNavigate(path: string): void;
  onLogout(): void | Promise<void>;
  onNotificationActionError?(message: string): void;
}

const desktopNavigation = [['Inicio', '/'], ['Hogares', '/households'], ['Mis listas', '/lists'], ['NFC', '/nfc']] as const;
const mobileNavigation = [['Inicio', '/'], ['Hogares', '/households'], ['Listas', '/lists'], ['NFC', '/nfc']] as const;

export function AppShell({ user, pathname, onNavigate, onLogout, onNotificationActionError, children }: AppShellProps): JSX.Element {
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function closeProfile(restoreFocus = false): void { setProfileOpen(false); if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus()); }

  useEffect(() => {
    if (!profileOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeProfile(true); };
    const outside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeProfile(); };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('mousedown', outside); };
  }, [profileOpen]);

  function go(path: string): void { closeProfile(); onNavigate(path); }

  return <div className="app-shell">
    <header className="app-shell__header">
      <a className="app-shell__brand" href="/" onClick={(event) => { event.preventDefault(); go('/'); }}><img src={logo} alt="NFCompra" /></a>
      <nav className="app-shell__desktop-nav" aria-label="Navegación principal">
        {desktopNavigation.map(([label, path]) => <a key={path} href={path} aria-current={pathname === path ? 'page' : undefined} onClick={(event) => { event.preventDefault(); go(path); }}>{label}</a>)}
      </nav>
      <div className="app-shell__actions">
        <button className="app-shell__apk" type="button" disabled title="Próximamente">Descargar APK</button>
        <NotificationBell onNavigate={onNavigate} onActionError={onNotificationActionError} />
        <div className="app-shell__profile" ref={menuRef}>
          <button ref={triggerRef} className="app-shell__profile-trigger" type="button" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>{user.name}</button>
          {profileOpen ? <div className="app-shell__profile-menu" role="group" aria-label="Opciones de perfil">
            <p><strong>{user.name}</strong><span>{user.email}</span></p>
            <button type="button" onClick={() => go('/profile')}>Profile</button>
            <button type="button" onClick={() => go('/settings')}>Settings</button>
            <button type="button" onClick={() => void onLogout()}>Sign out</button>
          </div> : null}
        </div>
        <button className="app-shell__logout" type="button" onClick={() => void onLogout()}>Cerrar sesión</button>
      </div>
    </header>
    <main className="app-shell__content">{children}</main>
    <nav className="app-shell__mobile-nav" aria-label="Navegación móvil">
      {mobileNavigation.map(([label, path]) => <a key={path} href={path} aria-current={pathname === path ? 'page' : undefined} onClick={(event) => { event.preventDefault(); go(path); }}>{label}</a>)}
    </nav>
  </div>;
}
