import '@testing-library/jest-dom/vitest';

import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWebQueryClient } from '../shopping-list/ShoppingListRoute';
import { clearProductCatalogCacheForTests } from './product-catalog-api';
import { CatalogPage } from './CatalogPage';

afterEach(() => {
  cleanup();
  clearProductCatalogCacheForTests();
  vi.unstubAllGlobals();
});

describe('CatalogPage', () => {
  it('shows favorites first and toggles product favorites', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 2, products: [
        { id: 'prod-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, isFavorite: true },
        { id: 'prod-yogurt', name: 'Yogur natural', normalizedName: 'yogur natural', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: 'pack', source: null, sourceProductId: null, isFavorite: false },
      ] }));
      if (url.endsWith('/product-catalog/prod-milk/favorite') && init?.method === 'DELETE') return Promise.resolve(Response.json({ productId: 'prod-milk', isFavorite: false }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    expect(await screen.findByRole('button', { name: /Favoritos/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Leche entera')).toBeVisible();
    expect(screen.queryByText('Yogur natural')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar Leche entera de favoritos' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/product-catalog/prod-milk/favorite') && init?.method === 'DELETE')).toBe(true));
  });

  it('does not duplicate the category label inside catalog product cards', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 1, products: [
        { id: 'prod-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, isFavorite: true },
      ] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    const card = await screen.findByRole('article', { name: 'Leche entera' });
    expect(within(card).getAllByText('Lacteos', { exact: false })).toHaveLength(1);
  });
});
