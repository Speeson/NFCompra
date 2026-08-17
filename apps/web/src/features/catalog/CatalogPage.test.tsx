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
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros de búsqueda' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Categoría seleccionada' }));

    expect(await screen.findByText('Pan de leche')).toBeVisible();
    expect(screen.queryByText('Pan rustico')).not.toBeInTheDocument();
  });

  it('opens search filters from an icon button instead of showing a select', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 0, products: [] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    await screen.findByRole('button', { name: /Favoritos/ });
    expect(screen.queryByLabelText('Filtro de búsqueda')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros de búsqueda' }));

    expect(screen.getByRole('dialog', { name: 'Filtro de búsqueda' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Todos los productos' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Favoritos' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Categoría seleccionada' })).toBeVisible();
  });

  it('opens a combined create dialog and creates a category or product', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/product-categories') && (!init?.method || init.method === 'GET')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 0, products: [] }));
      if (url.endsWith('/product-categories') && init?.method === 'POST') return Promise.resolve(Response.json({ category: { id: 'cat-clean', name: 'Limpieza', normalizedName: 'limpieza', parentId: null, iconKey: 'clean', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '' } }, { status: 201 }));
      if (url.endsWith('/product-catalog') && init?.method === 'POST') return Promise.resolve(Response.json({ product: { id: 'prod-water', name: 'Agua mineral', normalizedName: 'agua mineral', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'water', brand: null, packageSize: '1 L', source: 'user', sourceProductId: null, isFavorite: false } }, { status: 201 }));
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage isAdmin /></QueryClientProvider>);

    await screen.findByRole('button', { name: /Favoritos/ });
    fireEvent.click(screen.getByRole('button', { name: 'Crear en catálogo' }));
    expect(screen.getByRole('dialog', { name: 'Crear' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Categoría' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Limpieza' } });
    fireEvent.change(screen.getByLabelText('Icono de la categoría'), { target: { value: 'clean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/product-categories') && init?.method === 'POST')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Crear en catálogo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Producto' }));
    fireEvent.change(screen.getByLabelText('Nombre del producto'), { target: { value: 'Agua mineral' } });
    fireEvent.change(screen.getByLabelText('Categoría del producto'), { target: { value: 'cat-dairy' } });
    fireEvent.change(screen.getByLabelText('Icono del producto'), { target: { value: 'water-drink' } });
    fireEvent.change(screen.getByLabelText('Tamaño del producto'), { target: { value: '1 L' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/product-catalog') && init?.method === 'POST')).toBe(true));
  });

  it('opens category and product action menus for editing or deleting entries', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, scope: 'system', householdId: null, permissions: { canEdit: true, canDelete: true }, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 1, products: [
        { id: 'prod-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, scope: 'system', householdId: null, permissions: { canEdit: true, canDelete: true }, isFavorite: false },
      ] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage isAdmin /></QueryClientProvider>);

    const categoryButton = await screen.findByRole('button', { name: /Lacteos/ });
    fireEvent.click(categoryButton);
    expect(screen.queryByRole('button', { name: 'Acciones de categoría' })).not.toBeInTheDocument();
    fireEvent.click(categoryButton);
    expect(screen.queryByRole('dialog', { name: 'Acciones de categoría' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar categoría' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Eliminar categoría' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de producto Leche entera' }));
    expect(screen.getByRole('button', { name: 'Editar producto' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Eliminar producto' })).toBeVisible();
  });

  it('hides catalog management controls for a non-admin without a household', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'cat-dairy', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, createdAt: '', updatedAt: '' },
      ] }));
      if (url.endsWith('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 1, products: [
        { id: 'prod-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-dairy', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, isFavorite: false },
      ] }));
      throw new Error(`Solicitud inesperada: ${url}`);
    }));

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    await screen.findByRole('button', { name: /Favoritos/ });
    expect(screen.queryByRole('button', { name: 'Crear en catálogo' })).not.toBeInTheDocument();

    const categoryButton = screen.getByRole('button', { name: /Lacteos/ });
    fireEvent.click(categoryButton);
    expect(screen.queryByRole('button', { name: 'Editar categoría' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar categoría' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Acciones de producto Leche entera' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar producto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar producto' })).not.toBeInTheDocument();
  });

  it('lets a normal household member create household products and shows the house visual without system edit controls', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/households')) return Promise.resolve(Response.json({ households: [{ id: 'household-1', name: 'Casa', ownerId: 'user-1' }] }));
      if (url.includes('/product-categories')) return Promise.resolve(Response.json({ categories: [
        { id: 'favorites', name: 'Favoritos', normalizedName: 'favoritos', parentId: null, iconKey: 'star', source: 'user', sourceCategoryId: null, createdAt: '', updatedAt: '', isFavorite: true },
        { id: 'sys-cat', name: 'Lacteos', normalizedName: 'lacteos', parentId: null, iconKey: 'milk', source: null, sourceCategoryId: null, scope: 'system', householdId: null, permissions: { canEdit: false, canDelete: false }, createdAt: '', updatedAt: '' },
        { id: 'h1-cat', name: 'Bodega', normalizedName: 'bodega', parentId: null, iconKey: 'wine', source: null, sourceCategoryId: null, scope: 'household', householdId: 'household-1', permissions: { canEdit: true, canDelete: true }, createdAt: '', updatedAt: '' },
      ] }));
      if (url.includes('/product-catalog/snapshot')) return Promise.resolve(Response.json({ version: 'v1', productCount: 2, products: [
        { id: 'sys-milk', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'sys-cat', categoryName: 'Lacteos', iconKey: 'milk', brand: null, packageSize: '1 L', source: null, sourceProductId: null, scope: 'system', householdId: null, permissions: { canEdit: false, canDelete: false }, isFavorite: true },
        { id: 'h1-wine', name: 'Vino del pueblo', normalizedName: 'vino del pueblo', categoryId: 'h1-cat', categoryName: 'Bodega', iconKey: 'wine', brand: null, packageSize: '750 ml', source: null, sourceProductId: null, scope: 'household', householdId: 'household-1', permissions: { canEdit: true, canDelete: true }, isFavorite: false },
      ] }));
      if (url.endsWith('/product-catalog') && init?.method === 'POST') {
        return Promise.resolve(Response.json({ product: { id: 'h1-new', name: 'Agua del pozo', normalizedName: 'agua del pozo', categoryId: 'h1-cat', categoryName: 'Bodega', iconKey: 'water', brand: null, packageSize: null, source: null, sourceProductId: null, scope: 'household', householdId: 'household-1', permissions: { canEdit: true, canDelete: true }, isFavorite: false } }, { status: 201 }));
      }
      throw new Error(`Solicitud inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QueryClientProvider client={createWebQueryClient()}><CatalogPage /></QueryClientProvider>);

    await screen.findByRole('button', { name: /Favoritos/ });
    expect(screen.getByRole('button', { name: 'Crear en catálogo' })).toBeInTheDocument();

    const systemCard = screen.getByRole('article', { name: 'Leche entera' });
    expect(within(systemCard).queryByRole('img', { name: 'Producto del hogar' })).not.toBeInTheDocument();
    expect(within(systemCard).queryByRole('button', { name: 'Acciones de producto Leche entera' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bodega/ }));
    const householdCard = screen.getByRole('article', { name: 'Vino del pueblo' });
    expect(within(householdCard).getByRole('img', { name: 'Producto del hogar' })).toBeInTheDocument();
    expect(householdCard).toHaveClass('product-result-card--household');
    expect(within(householdCard).getByRole('button', { name: 'Acciones de producto Vino del pueblo' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Crear en catálogo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Producto' }));
    fireEvent.change(screen.getByLabelText('Nombre del producto'), { target: { value: 'Agua del pozo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/product-catalog') && init?.method === 'POST')).toBe(true));
  });
});
