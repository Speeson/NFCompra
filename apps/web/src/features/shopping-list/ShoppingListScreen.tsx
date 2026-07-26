import type { JSX } from 'react';

import type { ShoppingItem } from './model';

type ShoppingListScreenProps = {
  title: string;
  items: ShoppingItem[];
  isOffline: boolean;
};

export function ShoppingListScreen({
  title,
  items,
  isOffline
}: ShoppingListScreenProps): JSX.Element {
  const pendingItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);

  return (
    <main className="shopping-list">
      <header className="shopping-list__header">
        <div>
          <p className="eyebrow">Lista de la compra</p>
          <h1>{title}</h1>
        </div>
        <button type="button" className="icon-button" aria-label="Añadir producto">
          <span aria-hidden="true">+</span>
        </button>
      </header>

      {isOffline ? <p className="offline-notice">Sin conexión</p> : null}

      <ShoppingSection title="Pendientes" items={pendingItems} emptyMessage="No quedan productos pendientes." />
      <ShoppingSection title="Comprados" items={checkedItems} emptyMessage="Aún no has marcado ningún producto." />
    </main>
  );
}

function ShoppingSection({
  title,
  items,
  emptyMessage
}: {
  title: string;
  items: ShoppingItem[];
  emptyMessage: string;
}): JSX.Element {
  return (
    <section className="shopping-section" aria-labelledby={`${title.toLowerCase()}-heading`}>
      <h2 id={`${title.toLowerCase()}-heading`}>{title}</h2>
      {items.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <ul className="shopping-items">
          {items.map((item) => (
            <li key={item.id} className={item.isChecked ? 'shopping-item shopping-item--checked' : 'shopping-item'}>
              <button
                type="button"
                className="check-button"
                aria-label={`${item.isChecked ? 'Desmarcar' : 'Marcar'} ${item.name}`}
                aria-pressed={item.isChecked}
              >
                <span aria-hidden="true">{item.isChecked ? '✓' : ''}</span>
              </button>
              <span className="shopping-item__name">{item.name}</span>
              <span className="shopping-item__quantity">
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
