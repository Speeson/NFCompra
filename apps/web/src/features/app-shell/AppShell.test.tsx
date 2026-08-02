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
  email: 'maria@example.com',
  emailVerifiedAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function renderShell() {
  const onNavigate = vi.fn();
  const onLogout = vi.fn();
  render(<AppShell user={user} pathname="/" onNavigate={onNavigate} onLogout={onLogout}><main>Contenido</main></AppShell>);
  return { onNavigate, onLogout };
}

afterEach(cleanup);

describe('AppShell', () => {
  it('muestra la marca, navegación principal, APK deshabilitado y notificaciones', () => {
    renderShell();
    const desktopNavigation = screen.getByRole('navigation', { name: 'Navegación principal' });

    expect(screen.getByRole('img', { name: 'NFCompra' })).toBeVisible();
    expect(within(desktopNavigation).getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(within(desktopNavigation).getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '/households');
    expect(within(desktopNavigation).getByRole('link', { name: 'Mis listas' })).toHaveAttribute('href', '/lists');
    expect(within(desktopNavigation).getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '/nfc');
    expect(screen.getByRole('button', { name: 'Descargar APK' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
  });

  it('ofrece acciones de perfil y devuelve el foco al cerrar con Escape', () => {
    const { onLogout } = renderShell();
    const trigger = screen.getByRole('button', { name: /María García/ });

    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    const profileControls = screen.getByRole('group', { name: 'Opciones de perfil' });
    expect(profileControls).toBeVisible();
    expect(within(profileControls).getByRole('button', { name: 'Profile' })).toBeVisible();
    expect(within(profileControls).getByRole('button', { name: 'Settings' })).toBeVisible();
    fireEvent.click(within(profileControls).getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Opciones de perfil' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
