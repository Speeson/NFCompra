import { useEffect, useState, type FormEvent, type JSX, type PointerEvent } from 'react';

import { searchProductCatalog, type ProductCatalogItem } from '../catalog/product-catalog-api';
import type { ShoppingItem } from './model';

type ProductInput = { name: string; quantity: number; unit: string | null };
type PendingProduct = ProductInput & {
  key: string;
  catalogProductId: string;
  categoryName: string | null;
  packageSize: string | null;
  icon: string;
};
type ProductPickerMode = 'list' | 'cards';
type ShoppingListScreenProps = {
  title: string;
  items: ShoppingItem[];
  isOffline: boolean;
  onAdd?: (input: ProductInput) => void;
  onToggle?: (item: ShoppingItem) => void;
  onUpdate?: (item: ShoppingItem, input: ProductInput) => void;
  onDelete?: (item: ShoppingItem) => void;
};

const pickerModeStorageKey = 'nfcompra.product-picker-mode';

export function ShoppingListScreen({ title, items, isOffline, onAdd, onToggle, onUpdate, onDelete }: ShoppingListScreenProps): JSX.Element {
  const pendingItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [suggestions, setSuggestions] = useState<ProductCatalogItem[]>([]);
  const [pickerMode, setPickerMode] = useState<ProductPickerMode>(() => pickerModeFromStorage());
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});
  const [waitlist, setWaitlist] = useState<PendingProduct[]>([]);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const search = name.trim();
    if (isOffline || search.length < 2) {
      setSuggestions([]);
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      void searchProductCatalog(search, pickerMode === 'cards' ? 12 : 8)
        .then((products) => { if (active) setSuggestions(products); })
        .catch(() => { if (active) setSuggestions([]); });
    }, pickerMode === 'cards' ? 80 : 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOffline, name, pickerMode]);

  function changePickerMode(mode: ProductPickerMode): void {
    setPickerMode(mode);
    localStorage.setItem(pickerModeStorageKey, mode);
    setSuggestions([]);
    setCardQuantities({});
  }

  function addItem(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (isOffline || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onAdd?.({ name: name.trim(), quantity: parsedQuantity, unit: null });
    setName('');
    setQuantity('1');
    setSuggestions([]);
  }

  function addWaitlist(): void {
    if (isOffline || !waitlist.length) return;
    waitlist.forEach(({ name: productName, quantity: productQuantity, unit }) => onAdd?.({ name: productName, quantity: productQuantity, unit }));
    setWaitlist([]);
    setSuggestions([]);
    setCardQuantities({});
    setName('');
  }

  function selectSuggestion(suggestion: ProductCatalogItem): void {
    setName(suggestion.name);
    setSuggestions([]);
  }

  function updateCardQuantity(productId: string, delta: number): void {
    setCardQuantities((current) => ({ ...current, [productId]: Math.max(0, (current[productId] ?? 0) + delta) }));
  }

  function updateManualQuantity(delta: number): void {
    setQuantity((current) => String(Math.max(1, Math.round((Number(current) || 1) + delta))));
  }

  function addSuggestionToWaitlist(suggestion: ProductCatalogItem): void {
    const selectedQuantity = cardQuantities[suggestion.id] ?? 0;
    if (selectedQuantity <= 0) return;
    const icon = productIcon(suggestion);
    setWaitlist((current) => {
      const existing = current.find((product) => product.catalogProductId === suggestion.id);
      if (existing) return current.map((product) => product.catalogProductId === suggestion.id ? { ...product, quantity: product.quantity + selectedQuantity } : product);
      return [...current, {
        key: suggestion.id,
        catalogProductId: suggestion.id,
        name: suggestion.name,
        quantity: selectedQuantity,
        unit: null,
        categoryName: suggestion.categoryName,
        packageSize: suggestion.packageSize,
        icon,
      }];
    });
    setRecentlyAddedId(suggestion.id);
    window.setTimeout(() => setRecentlyAddedId((current) => current === suggestion.id ? null : current), 450);
    setCardQuantities((current) => ({ ...current, [suggestion.id]: 0 }));
  }

  function removeFromWaitlist(productId: string): void {
    setWaitlist((current) => current.filter((product) => product.catalogProductId !== productId));
  }

  return <main className="shopping-list">
    <header className="shopping-list__header">
      <div className="shopping-list__title">
        <h1>{title}</h1>
        {onAdd ? <ProductPickerToggle pickerMode={pickerMode} onChange={changePickerMode} /> : null}
      </div>
      {onAdd ? <>
        <form className={`product-form product-form--${pickerMode}`} onSubmit={addItem}>
          <label htmlFor="new-product-name">Producto</label>
          <div className="product-autocomplete"><input id="new-product-name" disabled={isOffline} value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} autoComplete="off" />
            {pickerMode === 'list' && suggestions.length ? <div className="product-suggestions" role="listbox" aria-label="Sugerencias de productos">{suggestions.map((suggestion) => <button key={suggestion.id} type="button" className="product-suggestion" onClick={() => selectSuggestion(suggestion)}>{suggestionLabel(suggestion)}</button>)}</div> : null}
          </div>
          <ManualQuantityStepper quantity={quantity} disabled={isOffline} onChange={updateManualQuantity} />
          <button type="submit" disabled={isOffline}>Añadir</button>
        </form>
        {pickerMode === 'cards' && suggestions.length ? <ProductCardResults suggestions={suggestions} quantities={cardQuantities} recentlyAddedId={recentlyAddedId} onQuantityChange={updateCardQuantity} onSelect={addSuggestionToWaitlist} /> : null}
        {pickerMode === 'cards' && waitlist.length ? <PendingProductWaitlist products={waitlist} onRemove={removeFromWaitlist} onCommit={addWaitlist} /> : null}
      </> : null}
    </header>
    {isOffline ? <p className="offline-notice" role="status">Sin conexión</p> : null}
    <ShoppingSection title="Pendientes" items={pendingItems} emptyMessage="No quedan productos pendientes." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
    <ShoppingSection title="Comprados" items={checkedItems} emptyMessage="Aún no has marcado ningún producto." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
  </main>;
}

function ProductPickerToggle({ pickerMode, onChange }: { pickerMode: ProductPickerMode; onChange(mode: ProductPickerMode): void }): JSX.Element {
  return <div className="product-picker-toggle" role="group" aria-label="Vista del autocompletado">
    <button type="button" aria-label="Vista de lista" aria-pressed={pickerMode === 'list'} onClick={() => onChange('list')}>☰</button>
    <button type="button" aria-label="Vista de tarjetas" aria-pressed={pickerMode === 'cards'} onClick={() => onChange('cards')}>▦</button>
  </div>;
}

function ManualQuantityStepper({ quantity, disabled, onChange }: { quantity: string; disabled: boolean; onChange(delta: number): void }): JSX.Element {
  return <div className="manual-quantity-stepper" role="group" aria-label="Cantidad del producto">
    <button type="button" aria-label="Reducir cantidad del producto" disabled={disabled || Number(quantity) <= 1} onClick={() => onChange(-1)}>−</button>
    <span aria-label="Cantidad seleccionada">{quantity}</span>
    <button type="button" aria-label="Aumentar cantidad del producto" disabled={disabled} onClick={() => onChange(1)}>+</button>
  </div>;
}

function ProductCardResults({ suggestions, quantities, recentlyAddedId, onQuantityChange, onSelect }: { suggestions: ProductCatalogItem[]; quantities: Record<string, number>; recentlyAddedId: string | null; onQuantityChange(productId: string, delta: number): void; onSelect(suggestion: ProductCatalogItem): void }): JSX.Element {
  return <section className="product-card-results" aria-label="Resultados de productos">
    {suggestions.map((suggestion) => {
      const selectedQuantity = quantities[suggestion.id] ?? 0;
      return <article key={suggestion.id} className={recentlyAddedId === suggestion.id ? 'product-result-card product-result-card--added' : 'product-result-card'}>
        <button type="button" className="product-result-card__main" aria-label={`Seleccionar ${suggestion.name}`} onClick={() => onSelect(suggestion)} disabled={selectedQuantity === 0}>
          <span className="product-result-card__icon" aria-hidden="true">{productIcon(suggestion)}</span>
          <span><strong>{suggestion.name}</strong><small>{[suggestion.categoryName, suggestion.packageSize].filter(Boolean).join(' · ')}</small></span>
          <span className="product-result-card__status">{selectedQuantity > 0 ? `x${selectedQuantity}` : 'Elige cantidad'}</span>
        </button>
        <div className="product-result-card__quantity" aria-label={`Cantidad de ${suggestion.name}`}>
          <button type="button" aria-label={`Reducir cantidad de ${suggestion.name}`} onClick={() => onQuantityChange(suggestion.id, -1)} disabled={selectedQuantity === 0}>−</button>
          <span>{selectedQuantity}</span>
          <button type="button" aria-label={`Aumentar cantidad de ${suggestion.name}`} onClick={() => onQuantityChange(suggestion.id, 1)}>+</button>
        </div>
      </article>;
    })}
  </section>;
}

function PendingProductWaitlist({ products, onRemove, onCommit }: { products: PendingProduct[]; onRemove(productId: string): void; onCommit(): void }): JSX.Element {
  const [dragStart, setDragStart] = useState<Record<string, number>>({});

  function pointerStart(productId: string, event: PointerEvent<HTMLLIElement>): void {
    setDragStart((current) => ({ ...current, [productId]: event.clientX }));
  }

  function pointerEnd(productId: string, event: PointerEvent<HTMLLIElement>): void {
    const start = dragStart[productId];
    if (typeof start === 'number' && event.clientX - start < -70) onRemove(productId);
    setDragStart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  return <section className="pending-product-tray" aria-label="Productos pendientes de añadir">
    <div className="pending-product-tray__header">
      <h2>Pendientes de añadir</h2>
      <button type="button" className="button" onClick={onCommit}>Añadir {products.length} {products.length === 1 ? 'producto' : 'productos'}</button>
    </div>
    <ul>
      {products.map((product) => <li key={product.catalogProductId} onPointerDown={(event) => pointerStart(product.catalogProductId, event)} onPointerUp={(event) => pointerEnd(product.catalogProductId, event)}>
        <span className="pending-product-tray__icon" aria-hidden="true">{product.icon}</span>
        <span><strong>{product.name}</strong><small>{[product.categoryName, product.packageSize].filter(Boolean).join(' · ')}</small></span>
        <strong>x{product.quantity}</strong>
        <button type="button" aria-label={`Quitar ${product.name} de pendientes de añadir`} onClick={() => onRemove(product.catalogProductId)}>×</button>
      </li>)}
    </ul>
    <p>Desliza un producto hacia la izquierda para quitarlo antes de añadirlo.</p>
  </section>;
}

function suggestionLabel(suggestion: ProductCatalogItem): string {
  return [suggestion.name, suggestion.categoryName, suggestion.packageSize].filter(Boolean).join(' · ');
}

function productIcon(product: ProductCatalogItem): string {
  const text = `${product.iconKey} ${product.categoryName ?? ''} ${product.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (text.includes('atun') || text.includes('pescado') || text.includes('marisco') || text.includes('fish')) return '🐟';
  if (text.includes('leche') || text.includes('lacteo') || text.includes('yogur') || text.includes('milk')) return '🥛';
  if (text.includes('pan') || text.includes('bolleria') || text.includes('bread')) return '🥖';
  if (text.includes('fruta') || text.includes('manzana') || text.includes('apple')) return '🍎';
  if (text.includes('verdura') || text.includes('zanahoria') || text.includes('carrot')) return '🥕';
  if (text.includes('carne') || text.includes('pollo') || text.includes('meat')) return '🥩';
  if (text.includes('agua') || text.includes('bebida') || text.includes('refresco') || text.includes('bottle')) return '💧';
  if (text.includes('limpieza') || text.includes('drogueria')) return '🧽';
  if (text.includes('mascota') || text.includes('perro') || text.includes('gato')) return '🐾';
  if (text.includes('conserva')) return '🥫';
  return '🛒';
}

function pickerModeFromStorage(): ProductPickerMode {
  return localStorage.getItem(pickerModeStorageKey) === 'list' ? 'list' : 'cards';
}

function ShoppingSection({ title, items, emptyMessage, isOffline, onToggle, onUpdate, onDelete }: { title: string; items: ShoppingItem[]; emptyMessage: string; isOffline: boolean; onToggle?: (item: ShoppingItem) => void; onUpdate?: (item: ShoppingItem, input: ProductInput) => void; onDelete?: (item: ShoppingItem) => void }): JSX.Element {
  return <section className={title === 'Comprados' ? 'shopping-section shopping-section--checked' : 'shopping-section shopping-section--pending'} aria-labelledby={`${title.toLowerCase()}-heading`}>
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
    {onUpdate ? <button type="button" className="item-action item-action--edit" aria-label={`Editar ${item.name}`} disabled={isOffline} onClick={() => setEditing(true)}>✎</button> : null}
    {onDelete ? <button type="button" className="item-action item-action--delete" aria-label={`Eliminar ${item.name}`} disabled={isOffline} onClick={() => onDelete(item)}>×</button> : null}
  </li>;
}
