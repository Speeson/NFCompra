import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient, ShoppingListRoute } from './ShoppingListRoute';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ShoppingListRoute', () => {
  it('restores the previous checked state and shows feedback when a toggle fails', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' });
    let rejectToggle: (error: Error) => void = () => undefined;
    const toggleResponse = new Promise<Response>((_resolve, reject) => {
      rejectToggle = reject;
    });
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items')) return Promise.resolve(Response.json({ items: [{ id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') return toggleResponse;
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);

    const toggle = await screen.findByRole('button', { name: 'Marcar Leche' });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Desmarcar Leche' })).toHaveAttribute('aria-pressed', 'true');
    });

    rejectToggle(new Error('Sin conexiÃ³n'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Marcar Leche' })).toHaveAttribute('aria-pressed', 'false');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el cambio.');
  });

  it('shows the server item and retries an item version conflict', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000002' });
    const item = { id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' };
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items')) return Promise.resolve(Response.json({ items: [item] }));
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') {
        attempts += 1;
        if (attempts === 1) return Promise.resolve(Response.json({ error: { code: 'ITEM_VERSION_CONFLICT', message: 'El producto ha cambiado.', details: { current: { ...item, name: 'Leche entera', normalizedName: 'leche entera', version: 2 } } } }, { status: 409 }));
        return Promise.resolve(Response.json({ item: { ...item, name: 'Leche entera', normalizedName: 'leche entera', version: 3, isChecked: true } }));
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Leche' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El producto ha cambiado en el servidor: Leche entera (versión 2).');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desmarcar Leche entera' })).toHaveAttribute('aria-pressed', 'true'));
    expect(attempts).toBe(2);
  });

  it('keeps a later optimistic mutation when an earlier mutation fails', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000003' });
    let rejectFirst: (error: Error) => void = () => undefined;
    const first = new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
    const second = new Promise<Response>(() => undefined);
    const item = (id: string, name: string) => ({ id, listId: 'list-1', name, normalizedName: name.toLowerCase(), quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' });
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items')) return Promise.resolve(Response.json({ items: [item('item-1', 'Leche'), item('item-2', 'Pan')] }));
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') return first;
      if (url.endsWith('/items/item-2') && init?.method === 'PATCH') return second;
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Leche' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desmarcar Leche' })).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Pan' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desmarcar Pan' })).toHaveAttribute('aria-pressed', 'true'));

    rejectFirst(new Error('Sin conexión'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar Leche' })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('button', { name: 'Desmarcar Pan' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores the confirmed state after two failed mutations of the same product', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000007' });
    let rejectFirst: (error: Error) => void = () => undefined;
    let rejectSecond: (error: Error) => void = () => undefined;
    const first = new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
    const second = new Promise<Response>((_resolve, reject) => { rejectSecond = reject; });
    const item = { id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' };
    let writes = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items')) return Promise.resolve(Response.json({ items: [item] }));
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') return ++writes === 1 ? first : second;
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Leche' }));
    await screen.findByRole('button', { name: 'Desmarcar Leche' });
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar Leche' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar Leche' })).toHaveAttribute('aria-pressed', 'false'));

    rejectFirst(new Error('Sin conexión'));
    rejectSecond(new Error('Sin conexión'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar el cambio.'));
    expect(writes).toBe(2);
    expect(screen.getByRole('button', { name: 'Marcar Leche' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('refreshes after OPERATION_IN_PROGRESS without reissuing the mutation', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000004' });
    const item = { id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' };
    let itemReads = 0;
    let patchWrites = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items')) { itemReads += 1; return Promise.resolve(Response.json({ items: [item] })); }
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') { patchWrites += 1; return Promise.resolve(Response.json({ error: { code: 'OPERATION_IN_PROGRESS', message: 'En curso.', details: {} } }, { status: 409 })); }
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar Leche' }));
    await waitFor(() => expect(itemReads).toBe(2));
    expect(patchWrites).toBe(1);
    expect(screen.getByRole('button', { name: 'Marcar Leche' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('rolls back optimistic add, edit and delete product changes', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000005' });
    let rejectAdd: (error: Error) => void = () => undefined;
    let rejectEdit: (error: Error) => void = () => undefined;
    let rejectDelete: (error: Error) => void = () => undefined;
    const add = new Promise<Response>((_resolve, reject) => { rejectAdd = reject; });
    const edit = new Promise<Response>((_resolve, reject) => { rejectEdit = reject; });
    const deletion = new Promise<Response>((_resolve, reject) => { rejectDelete = reject; });
    const item = { id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa' }] }));
      if (url.endsWith('/households/household-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'household-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items') && init?.method === 'POST') return add;
      if (url.endsWith('/lists/list-1/items')) return Promise.resolve(Response.json({ items: [item] }));
      if (url.endsWith('/items/item-1') && init?.method === 'PATCH') return edit;
      if (url.endsWith('/items/item-1') && init?.method === 'DELETE') return deletion;
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    await screen.findByText('Leche');
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'Pan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Pan')).toBeVisible();
    rejectAdd(new Error('Sin conexión'));
    await waitFor(() => expect(screen.queryByText('Pan')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar Leche' }));
    fireEvent.change(screen.getByLabelText('Nombre del producto'), { target: { value: 'Leche entera' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Leche entera')).toBeVisible();
    rejectEdit(new Error('Sin conexión'));
    expect(await screen.findByText('Leche')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Leche' }));
    await waitFor(() => expect(screen.queryByText('Leche')).not.toBeInTheDocument());
    rejectDelete(new Error('Sin conexión'));
    expect(await screen.findByText('Leche')).toBeVisible();
  });

  it('creates the first household and its default list', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000006' });
    let hasHousehold = false;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households') && init?.method === 'POST') { hasHousehold = true; return Promise.resolve(Response.json({ household: { id: 'home-1', name: 'Casa', ownerId: 'user-1', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }, defaultList: { id: 'list-1', householdId: 'home-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' } }, { status: 201 })); }
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: hasHousehold ? [{ id: 'home-1', name: 'Casa' }, { id: 'home-2', name: 'Piso' }] : [] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-2', householdId: 'home-2', name: 'Fin de semana', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items') || url.endsWith('/lists/list-2/items')) return Promise.resolve(Response.json({ items: [] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText('Nombre del hogar'), { target: { value: 'Casa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear hogar' }));
    await screen.findByRole('heading', { name: 'Compra' });

    expect(screen.getByLabelText('Hogar')).toHaveValue('home-1');
  });

  it('loads the selected household list', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }, { id: 'home-2', name: 'Piso' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-1', householdId: 'home-1', name: 'Compra', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/households/home-2/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-2', householdId: 'home-2', name: 'Piso', isDefault: true, version: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' }] }));
      if (url.endsWith('/lists/list-1/items') || url.endsWith('/lists/list-2/items')) return Promise.resolve(Response.json({ items: [] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><ShoppingListRoute /></QueryClientProvider>);
    await screen.findByRole('heading', { name: 'Compra' });
    fireEvent.change(screen.getByLabelText('Hogar'), { target: { value: 'home-2' } });
    expect(await screen.findByRole('heading', { name: 'Piso' })).toBeVisible();
  });
});
