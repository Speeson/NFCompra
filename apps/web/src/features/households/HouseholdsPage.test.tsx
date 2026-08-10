import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { HouseholdDetailPage, HouseholdsPage } from './HouseholdsPage';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

function respond(url: string): Response {
  if (url.endsWith('/households')) return Response.json({ households: [{ id: 'home-1', name: 'Casa', ownerId: 'user-1', createdAt: '', updatedAt: '' }] });
  if (url.endsWith('/households/home-1/lists')) return Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Compra', isDefault: true, version: 1, createdAt: '', updatedAt: '' }] });
  if (url.endsWith('/households/home-1/members')) return Response.json({ members: [{ userId: 'user-1', name: 'Ana', email: 'ana@example.test', role: 'owner', createdAt: '' }] });
  if (url.endsWith('/households/home-1/invitations')) return Response.json({ invitations: [] });
  return Response.json({ error: { message: 'Ruta inesperada' } }, { status: 404 });
}

function renderPage(node: ReactNode): void { render(<QueryClientProvider client={createWebQueryClient()}>{node}</QueryClientProvider>); }

describe('household route views', () => {
  it('creates a household from the households page and opens it', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households') && init?.method === 'POST') return Promise.resolve(Response.json({ household: { id: 'home-2', name: 'Piso' } }));
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<HouseholdsPage currentUserId="user-1" onNavigate={navigate} startCreating />);

    fireEvent.change(await screen.findByLabelText('Nombre del nuevo hogar'), { target: { value: 'Piso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hogar' }));

    expect(await screen.findByText('Piso')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households$/), expect.objectContaining({ method: 'POST' }));
    expect(navigate).toHaveBeenCalledWith('/households/home-2');
  });

  it('shows a household card and opens its exact detail route', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdsPage currentUserId="user-1" onNavigate={navigate} />);

    const card = await screen.findByRole('article', { name: 'Casa' });
    fireEvent.click(within(card).getByRole('button', { name: 'Abrir Casa' }));

    expect(within(card).getByRole('button', { name: 'Acceder Casa' })).toBeVisible();
    expect(within(card).getByText('Hogar abierto')).toBeVisible();
    expect(localStorage.getItem('nfcompra.active-household-id')).toBe('home-1');

    fireEvent.click(within(card).getByRole('button', { name: 'Acceder Casa' }));

    expect(navigate).toHaveBeenCalledWith('/lists?household=home-1');
  });

  it('renames and deletes a household from the household list', async () => {
    window.confirm = vi.fn(() => true);
    let householdName = 'Casa';
    let deleted = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households/home-1') && init?.method === 'PATCH') {
        householdName = JSON.parse(String(init.body)).name;
        return Promise.resolve(Response.json({ household: { id: 'home-1', name: householdName, ownerId: 'user-1', createdAt: '', updatedAt: '' } }));
      }
      if (url.endsWith('/households/home-1') && init?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve(Response.json({ status: 'deleted' }));
      }
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: deleted ? [] : [{ id: 'home-1', name: householdName, ownerId: 'user-1', createdAt: '', updatedAt: '' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      if (url.endsWith('/households/home-1/members')) return Promise.resolve(Response.json({ members: [{ userId: 'user-1', role: 'owner' }] }));
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<HouseholdsPage currentUserId="user-1" onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Casa' }));
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), { target: { value: 'Costa Marina III' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar hogar Casa' }));

    expect(await screen.findByRole('heading', { name: 'Costa Marina III' })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households\/home-1$/), expect.objectContaining({ method: 'PATCH' }));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Costa Marina III' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Costa Marina III' })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households\/home-1$/), expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows a leave action instead of delete for household members', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households/home-1/leave') && init?.method === 'DELETE') return Promise.resolve(Response.json({ status: 'left' }));
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa', ownerId: 'owner-1', createdAt: '', updatedAt: '' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      if (url.endsWith('/households/home-1/members')) return Promise.resolve(Response.json({ members: [{ userId: 'user-2', name: 'Luis', email: 'luis@example.test', role: 'member', createdAt: '' }] }));
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<HouseholdsPage currentUserId="user-2" onNavigate={vi.fn()} />);

    const card = await screen.findByRole('article', { name: 'Casa' });
    fireEvent.click(within(card).getByRole('button', { name: 'Desplegar Casa' }));

    expect(within(card).queryByRole('button', { name: 'Eliminar Casa' })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Salir de Casa' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households\/home-1\/leave$/), expect.objectContaining({ method: 'DELETE' })));
  });

  it('shows members and NFC actions only for the expanded household', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [
        { id: 'home-1', name: 'Casa', ownerId: 'user-1', createdAt: '', updatedAt: '' },
        { id: 'home-2', name: 'Piso', ownerId: 'user-1', createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/households/home-1/lists') || url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [] }));
      if (url.endsWith('/households/home-1/members') || url.endsWith('/households/home-2/members')) return Promise.resolve(Response.json({ members: [{ userId: 'user-1', role: 'owner' }] }));
      throw new Error(`Ruta inesperada: ${url}`);
    }));
    renderPage(<HouseholdsPage currentUserId="user-1" onNavigate={vi.fn()} />);

    const casa = await screen.findByRole('article', { name: 'Casa' });
    const piso = await screen.findByRole('article', { name: 'Piso' });
    fireEvent.click(within(casa).getByRole('button', { name: 'Desplegar Casa' }));

    expect(within(casa).getByRole('button', { name: 'Miembros de Casa' })).toBeVisible();
    expect(within(casa).getByRole('button', { name: 'Codigo NFC de Casa' })).toBeVisible();
    expect(within(piso).queryByRole('button', { name: 'Miembros de Piso' })).not.toBeInTheDocument();

    fireEvent.click(within(piso).getByRole('button', { name: 'Desplegar Piso' }));

    expect(within(casa).queryByRole('button', { name: 'Miembros de Casa' })).not.toBeInTheDocument();
    expect(within(piso).getByRole('button', { name: 'Miembros de Piso' })).toBeVisible();
  });

  it('keeps list and member workflows in separate household detail tabs', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdDetailPage householdId="home-1" currentUserId="user-1" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeVisible();
    expect(screen.getByText('Compra')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Miembros' }));
    expect(await screen.findByRole('heading', { name: 'Miembros' })).toBeVisible();
  });

  it('connects tabs to their panels and supports roving keyboard navigation', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))));
    renderPage(<HouseholdDetailPage householdId="home-1" currentUserId="user-1" onNavigate={vi.fn()} />);

    const listsTab = await screen.findByRole('tab', { name: 'Listas' });
    const membersTab = screen.getByRole('tab', { name: 'Miembros' });
    expect(listsTab).toHaveAttribute('aria-controls', 'household-home-1-lists-panel');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', listsTab.id);
    fireEvent.keyDown(listsTab, { key: 'ArrowRight' });
    expect(membersTab).toHaveFocus();
    expect(membersTab).toHaveAttribute('aria-selected', 'true');
    expect(membersTab).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(membersTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'NFC' })).toHaveFocus();
  });
});
