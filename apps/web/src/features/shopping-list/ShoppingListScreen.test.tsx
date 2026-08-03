import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { clearProductCatalogCacheForTests } from '../catalog/product-catalog-api';
import { ShoppingListScreen } from './ShoppingListScreen';

afterEach(() => {
  cleanup();
  clearProductCatalogCacheForTests();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('keeps the compact list autocomplete mode available', async () => {
  const onAdd = vi.fn();
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'list');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'lech' } });

  const suggestion = await screen.findByRole('button', { name: 'Leche entera · Lacteos · 1 L' });
  fireEvent.click(suggestion);
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Leche entera', quantity: 1, unit: null }));
});

it('adds product cards to a removable waitlist before committing them to pending items', async () => {
  const onAdd = vi.fn();
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'cards');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'atun' } });

  const card = await screen.findByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i });
  expect(card).toBeDisabled();
  fireEvent.click(card);
  expect(screen.queryByText('Pendientes de añadir')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Atun claro al natural Hacendado' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Atun claro al natural Hacendado' }));
  expect(card).not.toBeDisabled();
  fireEvent.click(card);

  expect(await screen.findByText('Pendientes de añadir')).toBeInTheDocument();
  const pendingTray = await screen.findByLabelText('Productos pendientes de añadir');
  expect(within(pendingTray).getByText('Atun claro al natural Hacendado')).toBeInTheDocument();
  expect(within(pendingTray).getByText('x2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Quitar Atun claro al natural Hacendado de pendientes de añadir' }));
  expect(screen.queryByText('Pendientes de añadir')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Atun claro al natural Hacendado' }));
  fireEvent.click(card);
  fireEvent.click(screen.getByRole('button', { name: 'Añadir 1 producto' }));

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Atun claro al natural Hacendado', quantity: 1, unit: null }));
});

function stubCatalogSnapshot(): void {
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/product-catalog/snapshot')) {
      return Promise.resolve(Response.json({
        version: 'v1',
        productCount: 2,
        products: [{
          id: 'prod-milk',
          name: 'Leche entera',
          normalizedName: 'leche entera',
          categoryId: 'cat-dairy',
          categoryName: 'Lacteos',
          iconKey: 'milk',
          brand: null,
          packageSize: '1 L',
          source: 'supermercados-espana',
          sourceProductId: 'milk-1',
        }, {
          id: 'prod-tuna',
          name: 'Atun claro al natural Hacendado',
          normalizedName: 'atun claro al natural hacendado',
          categoryId: 'cat-conservas',
          categoryName: 'Conservas, caldos y cremas',
          iconKey: 'shopping-basket',
          brand: 'Hacendado',
          packageSize: '0.48 kg',
          source: 'mercadona',
          sourceProductId: '18018',
        }],
      }));
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  }));
}
