import type { JSX } from 'react';

import { demoShoppingItems } from '../features/shopping-list/fixtures';
import { ShoppingListScreen } from '../features/shopping-list/ShoppingListScreen';

export function App(): JSX.Element {
  return <ShoppingListScreen title="Mercadona" items={demoShoppingItems} isOffline={false} />;
}
