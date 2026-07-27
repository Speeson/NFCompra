import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../app/App';
import { AuthProvider } from '../auth/AuthProvider';

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('invitation acceptance', () => {
  it('loads the direct acceptance route and preserves it through anonymous login', async () => {
    window.history.replaceState({}, '', '/invitations/accept?token=invite-token');
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión.', details: {} } }, { status: 401 }));
      if (url.endsWith('/auth/login')) return Promise.resolve(Response.json({ accessToken: 'access' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: { id: 'user-1', name: 'Ana', email: 'ana@example.test', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' } }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<AuthProvider><App /></AuthProvider>);
    expect(await screen.findByRole('heading', { name: 'Acepta tu invitación' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Iniciar sesión para continuar' })).toBeVisible();
    await waitFor(() => expect(sessionStorage.getItem('nfcompra.invitation-continuation')).toBe('/invitations/accept?token=invite-token'));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión para continuar' }));
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('button', { name: 'Aceptar invitación' })).toBeVisible();
  });

  it('shows the email mismatch error without revealing household details', async () => {
    window.history.replaceState({}, '', '/invitations/accept?token=invite-token');
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: { id: 'user-1', name: 'Ana', email: 'ana@example.test', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' } }));
      if (url.endsWith('/invitations/accept')) return Promise.resolve(Response.json({ error: { code: 'INVITATION_EMAIL_MISMATCH', message: 'La invitación no corresponde a esta cuenta.', details: {} } }, { status: 403 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<AuthProvider><App /></AuthProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La invitación no corresponde a esta cuenta.');
    expect(screen.queryByText(/Casa de/)).not.toBeInTheDocument();
  });

  it('accepts the invitation and navigates to the returned household', async () => {
    window.history.replaceState({}, '', '/invitations/accept?token=invite-token');
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: { id: 'user-1', name: 'Ana', email: 'ana@example.test', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' } }));
      if (url.endsWith('/invitations/accept')) return Promise.resolve(Response.json({ householdId: 'home-2', invitation: { id: 'invite-1' } }));
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-2', name: 'Piso' }] }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-2', householdId: 'home-2', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-2/items')) return Promise.resolve(Response.json({ items: [] }));
      if (url.endsWith('/households/home-2/members')) return Promise.resolve(Response.json({ members: [] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<AuthProvider><App /></AuthProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar invitación' }));
    expect(await screen.findByRole('heading', { name: 'Compra' })).toBeVisible();
    expect(window.location.search).toBe('?household=home-2');
    expect(sessionStorage.getItem('nfcompra.invitation-continuation')).toBeNull();
  });
});
