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
const androidApkDownloadUrl = 'https://github.com/Speeson/NFCompra/releases/latest/download/NFCompra-release.apk';

export function AppShell({ user, pathname, onNavigate, onLogout, onNotificationActionError, children }: AppShellProps): JSX.Element {
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);

  function closeProfile(restoreFocus = false): void {
    setProfileOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function isCurrent(path: string): boolean {
    return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
  }

  useEffect(() => {
    if (!profileOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeProfile(true); };
    const outside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeProfile(true); };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('mousedown', outside); };
  }, [profileOpen]);

  useEffect(() => {
    if (profileOpen) firstMenuItemRef.current?.focus();
  }, [profileOpen]);

  useEffect(() => {
    if (previousPathname.current !== pathname) contentRef.current?.focus();
    previousPathname.current = pathname;
  }, [pathname]);

  function go(path: string): void {
    closeProfile();
    onNavigate(path);
  }

  return <div className="app-shell">
    <header className="app-shell__header">
      <a className="app-shell__brand" href="/" onClick={(event) => { event.preventDefault(); go('/'); }}><img src={logo} alt="NFCompra" /></a>
      <nav className="app-shell__desktop-nav" aria-label="Navegación principal">
        {desktopNavigation.map(([label, path]) => <a key={path} href={path} aria-current={isCurrent(path) ? 'page' : undefined} onClick={(event) => { event.preventDefault(); go(path); }}>{label}</a>)}
      </nav>
      <div className="app-shell__actions">
        <a className="app-shell__apk" href={androidApkDownloadUrl}>Descargar APK</a>
        <NotificationBell onNavigate={onNavigate} onActionError={onNotificationActionError} />
        <div className="app-shell__profile" ref={menuRef}>
          <button ref={triggerRef} className="app-shell__profile-trigger" type="button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>{user.name}</button>
          {profileOpen ? <div className="app-shell__profile-menu" role="menu" aria-label="Opciones de perfil">
            <p><strong>{user.name}</strong><span>{user.email}</span></p>
            <button ref={firstMenuItemRef} role="menuitem" type="button" onClick={() => go('/profile')}>Profile</button>
            <button role="menuitem" type="button" onClick={() => go('/settings')}>Settings</button>
            <button className="app-shell__profile-logout" role="menuitem" type="button" onClick={() => void onLogout()}><LogoutIcon />Cerrar sesión</button>
          </div> : null}
        </div>
        <button className="app-shell__logout" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void onLogout()}><LogoutIcon /></button>
      </div>
    </header>
    <main ref={contentRef} className="app-shell__content" tabIndex={-1}>{children}</main>
    <nav className="app-shell__mobile-nav" aria-label="Navegación móvil">
      {mobileNavigation.map(([label, path]) => <a key={path} href={path} aria-current={isCurrent(path) ? 'page' : undefined} onClick={(event) => { event.preventDefault(); go(path); }}>{label}</a>)}
    </nav>
  </div>;
}

function LogoutIcon(): JSX.Element {
  return <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M15 7l5 5-5 5M20 12H9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}
