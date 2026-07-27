import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { NotificationBell } from './NotificationBell';

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
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/invitations/accept'));
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
});
