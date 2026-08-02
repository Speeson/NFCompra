import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from './ShoppingListRoute';
import { ListsPage } from './ListsPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ListsPage', () => {
  it('groups active lists by household and opens the exact list context', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'home-1', name: 'Casa' }] }));
      if (url.endsWith('/households/home-1/lists')) return Promise.resolve(Response.json({ lists: [{ id: 'list-7', householdId: 'home-1', name: 'Compra semanal', isDefault: true, version: 1, createdAt: '', updatedAt: '' }] }));
      if (url.endsWith('/lists/list-7/items')) return Promise.resolve(Response.json({ items: [{ id: 'item-1', listId: 'list-7', name: 'Pan', isChecked: false }] }));
      throw new Error(`Ruta inesperada: ${url}`);
    }));
    render(<QueryClientProvider client={createWebQueryClient()}><ListsPage onNavigate={navigate} /></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Compra semanal' }));

    expect(navigate).toHaveBeenCalledWith('/lists/list-7');
  });
});
