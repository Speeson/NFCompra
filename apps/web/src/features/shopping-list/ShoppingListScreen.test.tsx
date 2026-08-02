import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { ShoppingListScreen } from './ShoppingListScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows catalog suggestions while adding a product and submits the selected name', async () => {
  const onAdd = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/product-catalog?')) {
      return Promise.resolve(Response.json({
        products: [{
          id: 'prod-milk',
          name: 'Leche entera',
          normalizedName: 'leche entera',
          categoryId: 'cat-dairy',
          categoryName: 'Lácteos',
          iconKey: 'milk',
          brand: null,
          packageSize: '1 L',
          source: 'supermercados-espana',
          sourceProductId: 'milk-1',
        }],
      }));
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  }));

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'lech' } });

  const suggestion = await screen.findByRole('button', { name: 'Leche entera · Lácteos · 1 L' });
  fireEvent.click(suggestion);
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Leche entera', quantity: 1, unit: null }));
});
