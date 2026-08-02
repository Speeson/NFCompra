import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { DashboardPage } from './DashboardPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function renderDashboard(onNavigate = vi.fn()): void {
  render(<QueryClientProvider client={createWebQueryClient()}><DashboardPage userName="Ana" onNavigate={onNavigate} /></QueryClientProvider>);
}

function responseForDashboard(url: string): Response {
  if (url.endsWith('/households')) return Response.json({ households: [{ id: 'home-1', name: 'Casa' }] });
  if (url.endsWith('/households/home-1/members')) return Response.json({ members: [{ userId: 'user-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '2026-08-02T00:00:00.000Z' }, { userId: 'user-2', name: 'Bea', email: 'bea@example.test', role: 'member', createdAt: '2026-08-02T00:00:00.000Z' }] });
  if (url.endsWith('/households/home-1/lists')) return Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Compra semanal', isDefault: true, version: 1, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' }] });
  if (url.endsWith('/lists/list-1/items')) return Response.json({ items: [{ id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' }, { id: 'item-2', listId: 'list-1', name: 'Pan', normalizedName: 'pan', quantity: 1, unit: null, category: null, note: null, isChecked: true, position: 1, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z' }] });
  if (url.endsWith('/notifications')) return Response.json({ notifications: [{ id: 'notice-1', type: 'item_updated', title: 'Bea actualizó Compra semanal', body: 'Ha añadido leche', householdId: 'home-1', listId: 'list-1', invitationId: null, readAt: null, createdAt: '2026-08-02T09:00:00.000Z' }] });
  return Response.json({ error: { message: 'Ruta inesperada' } }, { status: 404 });
}

describe('DashboardPage', () => {
  it('shows household counts, list progress and recent activity from existing queries', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(responseForDashboard(String(input)))));

    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Casa' })).toBeVisible();
    expect(await screen.findByText('1 pendiente')).toBeVisible();
    expect(screen.getByText('2 miembros')).toBeVisible();
    expect(screen.getByText('1 lista')).toBeVisible();
    expect(screen.getByText('Compra semanal')).toBeVisible();
    expect(screen.getByText('1 de 2 artículos comprados')).toBeVisible();
    expect(screen.getByText('Bea actualizó Compra semanal')).toBeVisible();
  });

  it('navigates cards and quick actions without submitting mutations', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(responseForDashboard(String(input))));
    vi.stubGlobal('fetch', fetchMock);
    renderDashboard(navigate);

    await screen.findByRole('heading', { name: 'Casa' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Casa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear hogar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir NFC' }));

    expect(navigate).toHaveBeenNthCalledWith(1, '/?household=home-1');
    expect(navigate).toHaveBeenNthCalledWith(2, '/households?create=1');
    expect(navigate).toHaveBeenNthCalledWith(3, '/lists?create=1');
    expect(navigate).toHaveBeenNthCalledWith(4, '/nfc');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method && init.method !== 'GET')).toBe(false);
  });

  it('shows loading, error and empty states', async () => {
    let resolveHouseholds!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/households')) return new Promise<Response>((resolve) => { resolveHouseholds = resolve; });
      return Promise.resolve(responseForDashboard(String(input)));
    }));
    renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando el resumen');
    resolveHouseholds(Response.json({ households: [] }));
    expect(await screen.findByText('Todavía no tienes hogares.')).toBeVisible();

    cleanup();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ error: { message: 'No disponible' } }, { status: 503 }))));
    renderDashboard();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el resumen de hogares.');
  });

  it('uses an explicit empty state when there is no recent activity', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/notifications')) return Promise.resolve(Response.json({ notifications: [] }));
      return Promise.resolve(responseForDashboard(String(input)));
    }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText('No tienes actividad reciente.')).toBeVisible());
  });

  it('keeps other household cards available when one household detail query fails', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa uno' }, { id: 'home-2', name: 'Casa dos' }] }));
      if (url.endsWith('/households/home-1/members')) return Promise.resolve(Response.json({ members: [{ userId: 'user-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '2026-08-02T00:00:00.000Z' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      if (url.endsWith('/households/home-2/members')) return Promise.resolve(Response.json({ error: { message: 'No disponible' } }, { status: 503 }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [] }));
      if (url.endsWith('/notifications')) return Promise.resolve(Response.json({ notifications: [] }));
      return Promise.resolve(Response.json({ error: { message: 'Ruta inesperada' } }, { status: 404 }));
    }));
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Casa uno' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Casa dos' })).toBeVisible();
    expect(screen.getByText('No se pudo cargar este hogar.')).toBeVisible();
  });
});
