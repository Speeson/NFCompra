import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByRole('img', { name: 'NFCompra' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Hogares' })).toHaveAttribute('href', '/households');
    expect(screen.getByRole('link', { name: 'Mis listas' })).toHaveAttribute('href', '/lists');
    expect(screen.getByRole('link', { name: 'NFC' })).toHaveAttribute('href', '/nfc');
    expect(screen.getByRole('button', { name: 'Descargar APK' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
  });

  it('ofrece acciones de perfil y devuelve el foco al cerrar con Escape', () => {
    const { onLogout } = renderShell();
    const trigger = screen.getByRole('button', { name: /María García/ });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu', { name: 'Menú de perfil' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Menú de perfil' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('incluye navegación móvil táctil para las cuatro secciones', () => {
    renderShell();

    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toHaveTextContent('Inicio');
    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toHaveTextContent('Hogares');
    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toHaveTextContent('Listas');
    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toHaveTextContent('NFC');
  });
});
