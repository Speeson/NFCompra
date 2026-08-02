import { useEffect, useState, type FormEvent, type JSX } from 'react';

import { searchProductCatalog, type ProductCatalogItem } from '../catalog/product-catalog-api';
import type { ShoppingItem } from './model';

type ProductInput = { name: string; quantity: number; unit: string | null };
type ShoppingListScreenProps = {
  title: string;
  items: ShoppingItem[];
  isOffline: boolean;
  onAdd?: (input: ProductInput) => void;
  onToggle?: (item: ShoppingItem) => void;
  onUpdate?: (item: ShoppingItem, input: ProductInput) => void;
  onDelete?: (item: ShoppingItem) => void;
};

export function ShoppingListScreen({ title, items, isOffline, onAdd, onToggle, onUpdate, onDelete }: ShoppingListScreenProps): JSX.Element {
  const pendingItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [suggestions, setSuggestions] = useState<ProductCatalogItem[]>([]);

  useEffect(() => {
    let active = true;
    const search = name.trim();
    if (isOffline || search.length < 2) {
      setSuggestions([]);
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      void searchProductCatalog(search, 8)
        .then((products) => { if (active) setSuggestions(products); })
        .catch(() => { if (active) setSuggestions([]); });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOffline, name]);

  function addItem(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (isOffline || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onAdd?.({ name: name.trim(), quantity: parsedQuantity, unit: unit.trim() || null });
    setName(''); setQuantity('1'); setUnit(''); setSuggestions([]);
  }

  function selectSuggestion(suggestion: ProductCatalogItem): void {
    setName(suggestion.name);
    setSuggestions([]);
  }

  return <main className="shopping-list">
    <header className="shopping-list__header">
      <div><p className="eyebrow">Lista de la compra</p><h1>{title}</h1></div>
      <button type="button" className="icon-button" aria-label="Añadir producto" disabled={isOffline} onClick={() => document.getElementById('new-product-name')?.focus()}><span aria-hidden="true">+</span></button>
    </header>
    {isOffline ? <p className="offline-notice" role="status">Sin conexión</p> : null}
    {onAdd ? <form className="product-form" onSubmit={addItem}>
      <label htmlFor="new-product-name">Producto</label><div className="product-autocomplete"><input id="new-product-name" disabled={isOffline} value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} autoComplete="off" />
        {suggestions.length ? <div className="product-suggestions" role="listbox" aria-label="Sugerencias de productos">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" className="product-suggestion" onClick={() => selectSuggestion(suggestion)}>{suggestionLabel(suggestion)}</button>)}</div> : null}
      </div>
      <label htmlFor="new-product-quantity">Cantidad</label><input id="new-product-quantity" disabled={isOffline} type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
      <label htmlFor="new-product-unit">Unidad</label><input id="new-product-unit" disabled={isOffline} value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={50} />
      <button type="submit" disabled={isOffline}>Añadir</button>
    </form> : null}
    <ShoppingSection title="Pendientes" items={pendingItems} emptyMessage="No quedan productos pendientes." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
    <ShoppingSection title="Comprados" items={checkedItems} emptyMessage="Aún no has marcado ningún producto." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
  </main>;
}

function suggestionLabel(suggestion: ProductCatalogItem): string {
  return [suggestion.name, suggestion.categoryName, suggestion.packageSize].filter(Boolean).join(' · ');
}

function ShoppingSection({ title, items, emptyMessage, isOffline, onToggle, onUpdate, onDelete }: { title: string; items: ShoppingItem[]; emptyMessage: string; isOffline: boolean; onToggle?: (item: ShoppingItem) => void; onUpdate?: (item: ShoppingItem, input: ProductInput) => void; onDelete?: (item: ShoppingItem) => void }): JSX.Element {
  return <section className="shopping-section" aria-labelledby={`${title.toLowerCase()}-heading`}>
    <h2 id={`${title.toLowerCase()}-heading`}>{title}</h2>
    {items.length === 0 ? <p className="empty-state">{emptyMessage}</p> : <ul className="shopping-items">{items.map((item) => <ShoppingItemRow key={item.id} item={item} isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />)}</ul>}
  </section>;
}

function ShoppingItemRow({ item, isOffline, onToggle, onUpdate, onDelete }: { item: ShoppingItem; isOffline: boolean; onToggle?: (item: ShoppingItem) => void; onUpdate?: (item: ShoppingItem, input: ProductInput) => void; onDelete?: (item: ShoppingItem) => void }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? '');
  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (isOffline || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onUpdate?.(item, { name: name.trim(), quantity: parsedQuantity, unit: unit.trim() || null });
    setEditing(false);
  }
  return <li className={item.isChecked ? 'shopping-item shopping-item--checked' : 'shopping-item'}>
    <button type="button" className="check-button" aria-label={`${item.isChecked ? 'Desmarcar' : 'Marcar'} ${item.name}`} aria-pressed={item.isChecked} disabled={isOffline} onClick={() => onToggle?.(item)}><span aria-hidden="true">{item.isChecked ? '✓' : ''}</span></button>
    {editing ? <form onSubmit={save} className="product-edit-form">
      <label>Nombre<input aria-label="Nombre del producto" disabled={isOffline} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Cantidad<input aria-label="Cantidad del producto" disabled={isOffline} type="number" min="0.01" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <label>Unidad<input aria-label="Unidad del producto" disabled={isOffline} value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
      <button type="submit" disabled={isOffline}>Guardar</button><button type="button" disabled={isOffline} onClick={() => setEditing(false)}>Cancelar</button>
    </form> : <><span className="shopping-item__name">{item.name}</span><span className="shopping-item__quantity">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span></>}
    {onUpdate ? <button type="button" disabled={isOffline} onClick={() => setEditing(true)}>Editar {item.name}</button> : null}
    {onDelete ? <button type="button" disabled={isOffline} onClick={() => onDelete(item)}>Eliminar {item.name}</button> : null}
  </li>;
}
