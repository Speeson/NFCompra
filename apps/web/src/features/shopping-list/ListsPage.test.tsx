import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from './ShoppingListRoute';
import { ListsPage } from './ListsPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ListsPage', () => {
  it('groups active lists by household and opens the exact list context', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }, { id: 'home-2', name: 'Piso' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-7', householdId: 'home-1', name: 'Compra semanal', isDefault: true, version: 1, createdAt: '', updatedAt: '' }] }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-8', householdId: 'home-2', name: 'Mercadona', isDefault: false, version: 1, createdAt: '', updatedAt: '' }] }));
      if (url.endsWith('/lists/list-7/items')) return Promise.resolve(Response.json({ items: [{ id: 'item-1', listId: 'list-7', name: 'Pan', isChecked: false }] }));
      if (url.endsWith('/lists/list-8/items')) return Promise.resolve(Response.json({ items: [] }));
      throw new Error(`Ruta inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><ListsPage onNavigate={navigate} /></QueryClientProvider>);

    const casaGroup = await screen.findByRole('region', { name: 'Casa' });
    const pisoGroup = await screen.findByRole('region', { name: 'Piso' });
    expect(within(casaGroup).getByText('Compra semanal')).toBeVisible();
    expect(within(pisoGroup).getByText('Mercadona')).toBeVisible();
    fireEvent.click(within(casaGroup).getByRole('button', { name: 'Abrir Compra semanal' }));

    expect(navigate).toHaveBeenCalledWith('/lists/list-7');
  });

  it('does not show a zero count while products load and reports product errors', async () => {
    let rejectItems!: (reason: Error) => void;
    const pendingItems = new Promise<Response>((_resolve, reject) => { rejectItems = reject; });
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-7', householdId: 'home-1', name: 'Compra semanal', isDefault: true }] }));
      if (url.endsWith('/lists/list-7/items')) return pendingItems;
      throw new Error(`Ruta inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><ListsPage onNavigate={vi.fn()} /></QueryClientProvider>);

    expect(await screen.findByText('Cargando productos…')).toBeVisible();
    expect(screen.queryByText('0 pendientes')).not.toBeInTheDocument();
    rejectItems(new Error('Sin conexión'));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los productos.');
  });

  it('creates a list for the selected household and opens it', async () => {
    const navigate = vi.fn();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }));
      if (url.endsWith('/households/home-1/lists') && init?.method === 'POST') return Promise.resolve(Response.json({ list: { id: 'list-8', householdId: 'home-1', name: 'Mercadona', isDefault: false } }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [] }));
      throw new Error(`Ruta inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<QueryClientProvider client={createWebQueryClient()}><ListsPage onNavigate={navigate} startCreating /></QueryClientProvider>);

    fireEvent.change(await screen.findByLabelText('Nombre de la nueva lista'), { target: { value: 'Mercadona' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista' }));

    expect(await screen.findByText('Mercadona')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/households\/home-1\/lists$/), expect.objectContaining({ method: 'POST' }));
    expect(navigate).toHaveBeenCalledWith('/lists/list-8');
  });
});
