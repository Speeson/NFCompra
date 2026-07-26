import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { demoShoppingItems } from '../features/shopping-list/fixtures';
import { ShoppingListScreen } from '../features/shopping-list/ShoppingListScreen';

afterEach(cleanup);

describe('ShoppingListScreen', () => {
  it('separates pending and checked items', () => {
    render(<ShoppingListScreen title="Mercadona" items={demoShoppingItems} isOffline={false} />);

    expect(screen.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Comprados' })).toBeVisible();
    expect(screen.getByText('Leche')).toBeVisible();
  });

  it('shows the offline notice', () => {
    render(<ShoppingListScreen title="Mercadona" items={[]} isOffline />);

    expect(screen.getByText('Sin conexión')).toBeVisible();
  });
});
