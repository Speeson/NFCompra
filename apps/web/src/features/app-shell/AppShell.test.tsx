import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';

vi.mock('../notifications/NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Notificaciones">Notificaciones</button>,
}));

const user = {
  id: 'user-1',
  name: 'María García',
  firstName: 'Maria',
  lastName: 'Garcia',
  birthDate: '1990-01-01',
  username: 'maria',
  email: 'maria@example.com',
  emailVerifiedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderShell(pathname = '/') {
  const onNavigate = vi.fn();
  const onLogout = vi.fn();
  const view = render(<AppShell user={user} pathname={pathname} onNavigate={onNavigate} onLogout={onLogout}><h1>Contenido</h1></AppShell>);
  return { onNavigate, onLogout, ...view };
}

afterEach(cleanup);

describe('AppShell', () => {
  it('muestra la marca, navegación principal, enlace de APK y notificaciones', () => {
    renderShell();
    const desktopNavigation = screen.getByRole('navigation', { name: 'Navegación principal' });

    expect(screen.getByRole('img', { name: 'NFCompra' })).toBeVisible();
    expect(within(desktopNavigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(within(desktopNavigation).getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '/households');
    expect(within(desktopNavigation).getByRole('link', { name: 'Mis listas' })).toHaveAttribute('href', '/lists');
    expect(within(desktopNavigation).getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '/nfc');
    expect(screen.getByRole('link', { name: 'Descargar APK' })).toHaveAttribute(
      'href',
      'https://github.com/Speeson/NFCompra/releases/latest/download/NFCompra-release.apk',
    );
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
  });

  it('ofrece acciones de perfil y devuelve el foco al cerrar con Escape', () => {
    const { onLogout } = renderShell();
    const trigger = screen.getByRole('button', { name: /María García/ });

    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    const profileControls = screen.getByRole('menu', { name: 'Opciones de perfil' });
    expect(profileControls).toBeVisible();
    expect(within(profileControls).getByRole('menuitem', { name: 'Profile' })).toBeVisible();
    expect(within(profileControls).getByRole('menuitem', { name: 'Settings' })).toBeVisible();
    expect(within(profileControls).getByRole('menuitem', { name: 'Profile' })).toHaveFocus();
    fireEvent.click(within(profileControls).getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(onLogout).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Opciones de perfil' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('cierra el menú al interactuar fuera y restaura el foco al disparador', () => {
    renderShell();
    const trigger = screen.getByRole('button', { name: /María García/ });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Opciones de perfil' })).toBeVisible();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu', { name: 'Opciones de perfil' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marca como actual la sección de una ruta hija y mueve el foco al contenido al navegar', () => {
    const { rerender } = renderShell('/households/home-1');
    const desktopNavigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegación móvil' });

    expect(within(desktopNavigation).getByRole('link', { name: 'Hogares' })).toHaveAttribute('aria-current', 'page');
    expect(within(mobileNavigation).getByRole('link', { name: 'Hogares' })).toHaveAttribute('aria-current', 'page');

    rerender(<AppShell user={user} pathname="/lists/list-7" onNavigate={vi.fn()} onLogout={vi.fn()}><h1>Lista</h1></AppShell>);

    expect(screen.getByRole('main')).toHaveFocus();
    expect(within(desktopNavigation).getByRole('link', { name: 'Mis listas' })).toHaveAttribute('aria-current', 'page');
  });

  it('incluye enlaces móviles con URL y navegación cliente para las cuatro secciones', () => {
    const { onNavigate } = renderShell();
    const mobileNavigation = screen.getByRole('navigation', { name: 'Navegación móvil' });

    expect(within(mobileNavigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(within(mobileNavigation).getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '/households');
    expect(within(mobileNavigation).getByRole('link', { name: 'Listas' })).toHaveAttribute('href', '/lists');
    const nfc = within(mobileNavigation).getByRole('link', { name: 'NFC' });
    expect(nfc).toHaveAttribute('href', '/nfc');
    fireEvent.click(nfc);
    expect(onNavigate).toHaveBeenCalledWith('/nfc');
  });
});
