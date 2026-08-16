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

it('keeps the compact list autocomplete mode with the header quantity stepper', async () => {
  const onAdd = vi.fn();
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'list');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  expect(screen.getByRole('heading', { name: 'Compra' })).toBeInTheDocument();
  expect(screen.queryByText('Lista de la compra')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'lech' } });

  const suggestion = await screen.findByRole('button', { name: 'Leche entera · Lacteos · 1 L' });
  fireEvent.click(suggestion);
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad del producto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad del producto' }));

  expect(screen.getByLabelText('Cantidad seleccionada')).toHaveTextContent('3');
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Leche entera', quantity: 3, unit: null }));
});

it('creates a catalog product from compact list mode and keeps it ready to add', async () => {
  const onAdd = vi.fn();
  const fetchMock = stubCatalogCreate();
  localStorage.setItem('nfcompra.product-picker-mode', 'list');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'Agua mineral' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

  expect(screen.getByRole('dialog', { name: 'Crear producto' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Categoria')).toHaveValue('cat-water'));
  expect(within(screen.getByLabelText('Categoria')).getByRole('option', { name: /\uD83E\uDD64 Bebidas/ })).toBeInTheDocument();
  expect(screen.getByLabelText('Icono')).toHaveValue('cart');
  expect(within(screen.getByLabelText('Icono')).getByRole('option', { name: /\uD83E\uDDF7 Panales/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tama\u00f1o'), { target: { value: '1 L' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

  await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/product-catalog') && init?.method === 'POST')).toBe(true));
  const productRequest = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/product-catalog') && init?.method === 'POST')?.[1] as RequestInit;
  expect(JSON.parse(String(productRequest.body))).toMatchObject({ categoryId: 'cat-water', iconKey: 'cart', packageSize: '1 L' });
  expect(screen.getByLabelText('Producto')).toHaveValue('Agua mineral');

  fireEvent.click(screen.getByRole('button', { name: 'A\u00f1adir' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Agua mineral', quantity: 1, unit: null }));
});

it('creates a catalog product from card mode and queues it in the pending tray', async () => {
  const onAdd = vi.fn();
  stubCatalogCreate();
  localStorage.setItem('nfcompra.product-picker-mode', 'cards');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'Agua mineral' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad del producto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

  const pendingTray = await screen.findByLabelText('Productos pendientes de a\u00f1adir');
  expect(within(pendingTray).getByText('Agua mineral')).toBeInTheDocument();
  expect(within(pendingTray).getByText('x2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'A\u00f1adir 1 producto' }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Agua mineral', quantity: 2, unit: null }));
});

it('places the mobile quick product button in the shopping list header', async () => {
  stubCatalogCreate();

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={vi.fn()} onClearChecked={vi.fn()} mobileSimpleActions />);

  const createButton = screen.getByRole('button', { name: 'Crear producto' });
  expect(createButton).toHaveClass('product-create-button--header');
  expect(createButton).toHaveTextContent('+');
  fireEvent.click(createButton);

  expect(screen.getByRole('dialog', { name: 'Crear producto' })).toBeInTheDocument();
});

it('shows list suggestions with the favorite action integrated before the product text', async () => {
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'list');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'lech' } });

  const row = await screen.findByRole('option');
  const rowButtons = within(row).getAllByRole('button');

  expect(rowButtons[0]).toHaveAccessibleName('Añadir Leche entera de favoritos');
  expect(rowButtons[1]).toHaveAccessibleName('Leche entera · Lacteos · 1 L');
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
  expect(screen.queryByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i })).not.toBeInTheDocument();
  const pendingTray = await screen.findByLabelText('Productos pendientes de añadir');
  expect(within(pendingTray).getByText('Atun claro al natural Hacendado')).toBeInTheDocument();
  expect(within(pendingTray).getByText('x2')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Quitar Atun claro al natural Hacendado de pendientes de añadir' }));
  expect(screen.queryByText('Pendientes de añadir')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Producto'), { target: { value: 'atun' } });
  const reopenedCard = await screen.findByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i });
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Atun claro al natural Hacendado' }));
  fireEvent.click(reopenedCard);
  fireEvent.click(screen.getByRole('button', { name: 'Añadir 1 producto' }));

  await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: 'Atun claro al natural Hacendado', quantity: 1, unit: null }));
});

it('blurs the product field when scrolling search results', async () => {
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'cards');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={vi.fn()} />);
  const productInput = screen.getByLabelText('Producto');
  productInput.focus();
  fireEvent.change(productInput, { target: { value: 'atun' } });

  const results = await screen.findByLabelText('Resultados de productos');
  expect(productInput).toHaveFocus();
  fireEvent.scroll(results);

  expect(productInput).not.toHaveFocus();
});

it('closes and reopens product search results when focus leaves and returns to the product field', async () => {
  const onAdd = vi.fn();
  stubCatalogSnapshot();
  localStorage.setItem('nfcompra.product-picker-mode', 'cards');

  render(<ShoppingListScreen title="Compra" items={[]} isOffline={false} onAdd={onAdd} />);
  const productInput = screen.getByLabelText('Producto');
  fireEvent.change(productInput, { target: { value: 'atun' } });

  expect(await screen.findByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i })).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i })).not.toBeInTheDocument();

  fireEvent.focus(productInput);
  expect(screen.getByRole('button', { name: /Seleccionar Atun claro al natural Hacendado/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Vista de lista' }));
  expect(await screen.findByRole('button', { name: 'Atun claro al natural Hacendado · Conservas, caldos y cremas · 0.48 kg' })).toBeInTheDocument();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('button', { name: 'Atun claro al natural Hacendado · Conservas, caldos y cremas · 0.48 kg' })).not.toBeInTheDocument();

  fireEvent.focus(productInput);
  expect(screen.getByRole('button', { name: 'Atun claro al natural Hacendado · Conservas, caldos y cremas · 0.48 kg' })).toBeInTheDocument();
});

it('edits a shopping item with the compact name and quantity stepper layout', async () => {
  const onUpdate = vi.fn();
  render(<ShoppingListScreen title="Compra" items={[{ id: 'item-1', name: 'Pan', quantity: 2, unit: 'kg', isChecked: false }]} isOffline={false} onUpdate={onUpdate} />);

  fireEvent.click(screen.getByRole('button', { name: 'Editar Pan' }));

  expect(screen.getByText('Nombre')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre del producto')).toHaveValue('Pan');
  expect(screen.queryByLabelText('Unidad del producto')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Cantidad seleccionada de Pan')).toHaveTextContent('2');
  expect(screen.getByRole('button', { name: 'Guardar Pan' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancelar edición de Pan' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Nombre del producto'), { target: { value: 'Pan integral' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad de Pan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Pan' }));

  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }), { name: 'Pan integral', quantity: 3, unit: null });
});

it('cancels a shopping item edit without saving local field changes', async () => {
  const onUpdate = vi.fn();
  render(<ShoppingListScreen title="Compra" items={[{ id: 'item-1', name: 'Pan', quantity: 2, isChecked: true }]} isOffline={false} onUpdate={onUpdate} />);

  fireEvent.click(screen.getByRole('button', { name: 'Editar Pan' }));
  fireEvent.change(screen.getByLabelText('Nombre del producto'), { target: { value: 'Pan integral' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición de Pan' }));

  expect(onUpdate).not.toHaveBeenCalled();
  expect(screen.getByText('Pan')).toBeInTheDocument();
  expect(screen.queryByLabelText('Nombre del producto')).not.toBeInTheDocument();
});

it('exposes list header actions for renaming, emptying checked products and deleting the list', async () => {
  const onRenameList = vi.fn();
  const onClearChecked = vi.fn();
  const onDeleteList = vi.fn();

  render(<ShoppingListScreen title="Compra semanal" items={[]} isOffline={false} onRenameList={onRenameList} onClearChecked={onClearChecked} onDeleteList={onDeleteList} />);

  fireEvent.click(screen.getByRole('button', { name: 'Cambiar nombre de Compra semanal' }));
  fireEvent.change(screen.getByLabelText('Nombre de la lista'), { target: { value: 'Mercadona' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre de Compra semanal' }));

  expect(onRenameList).toHaveBeenCalledWith('Mercadona');

  fireEvent.click(screen.getByRole('button', { name: 'Vaciar lista Compra semanal' }));
  expect(onClearChecked).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar lista Compra semanal' }));
  expect(onDeleteList).toHaveBeenCalledTimes(1);
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

function stubCatalogCreate(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/product-catalog/snapshot')) {
      return Promise.resolve(Response.json({
        version: 'v1',
        productCount: 0,
        products: [],
      }));
    }
    if (url.endsWith('/product-categories')) {
      return Promise.resolve(Response.json({
        categories: [{
          id: 'cat-water',
          name: 'Bebidas',
          normalizedName: 'bebidas',
          parentId: null,
          iconKey: 'drink',
          source: 'user',
          sourceCategoryId: null,
          createdAt: '',
          updatedAt: '',
          isFavorite: false,
        }],
      }));
    }
    if (url.endsWith('/product-catalog') && init?.method === 'POST') {
      return Promise.resolve(Response.json({
        product: {
          id: 'prod-water',
          name: 'Agua mineral',
          normalizedName: 'agua mineral',
          categoryId: 'cat-water',
          categoryName: 'Bebidas',
          iconKey: 'cart',
          brand: null,
          packageSize: '1 L',
          source: 'user',
          sourceProductId: null,
          isFavorite: false,
        },
      }, { status: 201 }));
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
