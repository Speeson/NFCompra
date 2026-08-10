import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { demoShoppingItems } from '../features/shopping-list/fixtures';
import { ShoppingListScreen } from '../features/shopping-list/ShoppingListScreen';
import { AuthenticatedRoute } from './App';

vi.mock('../features/shopping-list/ShoppingListRoute', () => ({
  createWebQueryClient: () => ({ clear: vi.fn() }),
  ShoppingListRoute: ({ requestedHouseholdId }: { requestedHouseholdId?: string | null }) => <div data-testid="shopping-route">{requestedHouseholdId}</div>,
}));

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

  it('renders the presentational profile and settings routes', () => {
    const props = { search: new URLSearchParams(), userId: 'user-1', userName: 'Ana', onNavigate: () => undefined };
    const { rerender } = render(<AuthenticatedRoute {...props} pathname="/profile" />);
    expect(screen.getByRole('heading', { name: 'Perfil' })).toBeVisible();
    rerender(<AuthenticatedRoute {...props} pathname="/settings" />);
    expect(screen.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  });

  it('routes HTTPS NFC household links to the shopping list household context', () => {
    const props = { search: new URLSearchParams(), userId: 'user-1', userName: 'Ana', onNavigate: () => undefined };

    render(<AuthenticatedRoute {...props} pathname="/household/home-1/lists" />);

    expect(screen.getByTestId('shopping-route')).toHaveTextContent('home-1');
  });
});
