import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { NotificationBell } from './NotificationBell';
import { App } from '../../app/App';
import { AuthProvider } from '../auth/AuthProvider';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('NotificationBell', () => {
  it('shows unread notifications, reads one or all, and navigates to invitation and list contexts', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/notifications/unread-count')) return Promise.resolve(Response.json({ count: 2 }));
      if (url.endsWith('/notifications')) return Promise.resolve(Response.json({ notifications: [
        { id: 'notice-invite', type: 'invitation_created', title: 'Nueva invitación', body: 'Acepta la invitación', householdId: 'home-1', listId: null, invitationId: 'invite-1', readAt: null, createdAt: '2026-07-27T00:00:00.000Z' },
        { id: 'notice-list', type: 'item_created', title: 'Pan añadido', body: 'Compra', householdId: 'home-1', listId: 'list-1', invitationId: null, readAt: null, createdAt: '2026-07-27T00:00:00.000Z' },
      ] }));
      if (url.endsWith('/notifications/notice-invite/read') && init?.method === 'PATCH') return Promise.resolve(Response.json({ status: 'read' }));
      if (url.endsWith('/notifications/notice-list/read') && init?.method === 'PATCH') return Promise.resolve(Response.json({ status: 'read' }));
      if (url.endsWith('/notifications/read-all') && init?.method === 'POST') return Promise.resolve(Response.json({ status: 'read' }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<QueryClientProvider client={createWebQueryClient()}><NotificationBell onNavigate={navigate} /></QueryClientProvider>);
    expect(await screen.findByRole('button', { name: 'Notificaciones (2 sin leer)' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (2 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva invitación' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/invite-1/accept'));
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (2 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pan añadido' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/?household=home-1&list=list-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (2 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/notifications/read-all') && init?.method === 'POST')).toBe(true));
  });

  it('only enables notification polling while the document is visible', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const fetchMock = vi.fn((input: string | URL | Request) => String(input).endsWith('/notifications/unread-count') ? Promise.resolve(Response.json({ count: 0 })) : Promise.resolve(Response.json({ notifications: [] })));
    vi.stubGlobal('fetch', fetchMock);
    render(<QueryClientProvider client={createWebQueryClient()}><NotificationBell onNavigate={vi.fn()} /></QueryClientProvider>);
    await screen.findByRole('button', { name: 'Notificaciones' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
  });

  it('shows notification read errors inline and still opens the selected context', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/notifications/unread-count')) return Promise.resolve(Response.json({ count: 1 }));
      if (url.endsWith('/notifications')) return Promise.resolve(Response.json({ notifications: [{ id: 'notice-1', type: 'item_created', title: 'Pan añadido', body: 'Compra', householdId: 'home-1', listId: 'list-1', invitationId: null, readAt: null, createdAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/notifications/notice-1/read')) return Promise.resolve(Response.json({ error: { code: 'REQUEST_FAILED', message: 'No se pudo marcar la notificación.', details: {} } }, { status: 503 }));
      if (url.endsWith('/notifications/read-all') && init?.method === 'POST') return Promise.resolve(Response.json({ error: { code: 'REQUEST_FAILED', message: 'No se pudieron marcar las notificaciones.', details: {} } }, { status: 503 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><NotificationBell onNavigate={navigate} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Notificaciones (1 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pan añadido' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/?household=home-1&list=list-1'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo marcar la notificación.');
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (1 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron marcar las notificaciones.');
  });

  it('changes the mounted shell selection when a notification targets another list', async () => {
    window.history.replaceState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return Promise.resolve(Response.json({ accessToken: 'access' }));
      if (url.endsWith('/me')) return Promise.resolve(Response.json({ user: { id: 'owner-1', name: 'Ana', email: 'ana@example.test', emailVerifiedAt: '2026-07-27T00:00:00.000Z', createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' } }));
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa uno' }, { id: 'home-2', name: 'Casa dos' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Lista uno', isDefault: true, version: 1, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-2', householdId: 'home-2', name: 'Lista dos', isDefault: true, version: 1, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items') || url.endsWith('/lists/list-2/items')) return Promise.resolve(Response.json({ items: [] }));
      if (url.endsWith('/households/home-1/members') || url.endsWith('/households/home-2/members')) return Promise.resolve(Response.json({ members: [{ userId: 'owner-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/notifications/unread-count')) return Promise.resolve(Response.json({ count: 1 }));
      if (url.endsWith('/notifications')) return Promise.resolve(Response.json({ notifications: [{ id: 'notice-list', type: 'item_created', title: 'Pan añadido', body: 'Lista dos', householdId: 'home-2', listId: 'list-2', invitationId: null, readAt: null, createdAt: '2026-07-27T00:00:00.000Z' }] }));
      if (url.endsWith('/notifications/notice-list/read') && init?.method === 'PATCH') return Promise.resolve(Response.json({ status: 'read' }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<AuthProvider><App /></AuthProvider>);
    await screen.findByRole('heading', { name: 'Lista uno' });
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones (1 sin leer)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pan añadido' }));
    expect(await screen.findByRole('heading', { name: 'Lista dos' })).toBeVisible();
    expect(screen.getByLabelText('Hogar')).toHaveValue('home-2');
    expect(screen.getByLabelText('Lista')).toHaveValue('list-2');
  });
});
