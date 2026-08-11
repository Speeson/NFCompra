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

  it('keeps the favorite action in the product card left rail', async () => {
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
    expect(within(card).getByRole('button', { name: 'Quitar Leche entera de favoritos' }).parentElement).toHaveClass('product-result-card__rail');
  });

  it('searches across all products instead of only the selected category', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
        { id: 'cat-bakery', name: 'Panaderia', normalizedName: 'panaderia', parentId: null, iconKey: 'bread', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 3, products: [
        { id: 'prod-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, isFavorite: true },
        { id: 'prod-bread', name: 'Pan rustico', normalizedName: 'pan rustico', categoryId: 'cat-bakery', categoryName: 'Panaderia', iconKey: 'bread', brand: null, packageSize: 'barra', source: null, sourceProductId: null, isFavorite: false },
        { id: 'prod-yogurt', name: 'Yogur natural', normalizedName: 'yogur natural', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: 'pack', source: null, sourceProductId: null, isFavorite: false },
      ] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    await screen.findByText('Leche entera');
    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'pan' } });

    expect(await screen.findByText('Pan rustico')).toBeVisible();
    expect(screen.queryByText('Leche entera')).not.toBeInTheDocument();
  });

  it('can filter search results by the selected category', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
        { id: 'cat-bakery', name: 'Panaderia', normalizedName: 'panaderia', parentId: null, iconKey: 'bread', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 2, products: [
        { id: 'prod-dairy-bread', name: 'Pan de leche', normalizedName: 'pan de leche', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: 'pack', source: null, sourceProductId: null, isFavorite: false },
        { id: 'prod-bread', name: 'Pan rustico', normalizedName: 'pan rustico', categoryId: 'cat-bakery', categoryName: 'Panaderia', iconKey: 'bread', brand: null, packageSize: 'barra', source: null, sourceProductId: null, isFavorite: false },
      ] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole('button', { name: /Lacteos/ }));
    fireEvent.change(screen.getByLabelText('Buscar productos'), { target: { value: 'pan' } });
    fireEvent.change(screen.getByLabelText('Filtro de búsqueda'), { target: { value: 'category' } });

    expect(await screen.findByText('Pan de leche')).toBeVisible();
    expect(screen.queryByText('Pan rustico')).not.toBeInTheDocument();
  });
});
