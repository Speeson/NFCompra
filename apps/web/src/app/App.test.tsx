import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { demoShoppingItems } from '../features/shopping-list/fixtures';
import { ShoppingListScreen } from '../features/shopping-list/ShoppingListScreen';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ShoppingListScreen', () => {
  it('separates pending and checked items', () => {
    const screen = renderScreen(
      <ShoppingListScreen title="Mercadona" items={demoShoppingItems} isOffline={false} />
    );

    expect(screen.getByRole('heading', { name: 'Pendientes' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Comprados' })).not.toBeNull();
    expect(screen.getByText('Leche')).not.toBeNull();
  });

  it('shows the offline notice', () => {
    const screen = renderScreen(<ShoppingListScreen title="Mercadona" items={[]} isOffline />);

    expect(screen.getByText('Sin conexión')).not.toBeNull();
  });
});

function renderScreen(ui: ReactNode) {
  const container = document.createElement('div');
  const root: Root = createRoot(container);

  act(() => root.render(ui));

  return {
    getByRole(role: string, options: { name: string }) {
      return Array.from(container.querySelectorAll(`[role="${role}"], ${role}`)).find(
        (element) => element.textContent === options.name
      );
    },
    getByText(text: string) {
      return Array.from(container.querySelectorAll('*')).find(
        (element) => element.textContent === text
      );
    }
  };
}
