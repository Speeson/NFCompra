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
});
