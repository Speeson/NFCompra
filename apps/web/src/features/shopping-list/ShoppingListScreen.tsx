import { useEffect, useRef, useState, type FormEvent, type JSX, type PointerEvent } from 'react';

import { ProductCatalogCard, ProductCatalogListItem, productIcon } from '../catalog/ProductCatalogCards';
import { catalogIconOptions, categoryOptionLabel } from '../catalog/catalog-icons';
import { createProductCatalogItem, fetchProductCategories, searchProductCatalog, setProductFavorite, type ProductCatalogInput, type ProductCatalogItem, type ProductCategory } from '../catalog/product-catalog-api';
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
  onRenameList?: (name: string) => void;
  onClearChecked?: () => void;
  onDeleteList?: () => void;
  mobileSimpleActions?: boolean;
  onToggle?: (item: ShoppingItem) => void;
  onUpdate?: (item: ShoppingItem, input: ProductInput) => void;
  onDelete?: (item: ShoppingItem) => void;
};

const pickerModeStorageKey = 'nfcompra.product-picker-mode';

export function ShoppingListScreen({ title, items, isOffline, onAdd, onRenameList, onClearChecked, onDeleteList, mobileSimpleActions = false, onToggle, onUpdate, onDelete }: ShoppingListScreenProps): JSX.Element {
  const pendingItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [suggestions, setSuggestions] = useState<ProductCatalogItem[]>([]);
  const [pickerMode, setPickerMode] = useState<ProductPickerMode>(() => pickerModeFromStorage());
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});
  const [waitlist, setWaitlist] = useState<PendingProduct[]>([]);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(true);
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [isRenamingList, setIsRenamingList] = useState(false);
  const [listNameDraft, setListNameDraft] = useState(title);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateInitialName, setQuickCreateInitialName] = useState('');
  const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [quickCreateCategories, setQuickCreateCategories] = useState<ProductCategory[]>([]);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const recentlyAddedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRenamingList) setListNameDraft(title);
  }, [isRenamingList, title]);

  useEffect(() => {
    function closeProductSearchOnOutsidePointer(event: globalThis.PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && !productSearchRef.current?.contains(target)) setIsProductSearchOpen(false);
    }

    document.addEventListener('pointerdown', closeProductSearchOnOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', closeProductSearchOnOutsidePointer);
      if (recentlyAddedTimeoutRef.current !== null) window.clearTimeout(recentlyAddedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const search = name.trim();
    if (isOffline || search.length < 3) {
      setSuggestions([]);
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      void searchProductCatalog(search, pickerMode === 'cards' ? 8 : 12)
        .then((products) => { if (active) setSuggestions(applyFavoriteOverrides(products, favoriteOverrides)); })
        .catch(() => { if (active) setSuggestions([]); });
    }, pickerMode === 'cards' ? 80 : 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [favoriteOverrides, isOffline, name, pickerMode]);

  function changePickerMode(mode: ProductPickerMode): void {
    setPickerMode(mode);
    localStorage.setItem(pickerModeStorageKey, mode);
    setSuggestions([]);
    setCardQuantities({});
    setIsProductSearchOpen(true);
  }

  function addItem(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (isOffline || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onAdd?.({ name: name.trim(), quantity: parsedQuantity, unit: null });
    setName('');
    setQuantity('1');
    setSuggestions([]);
    setIsProductSearchOpen(false);
  }

  function addWaitlist(): void {
    if (isOffline || !waitlist.length) return;
    waitlist.forEach(({ name: productName, quantity: productQuantity, unit }) => onAdd?.({ name: productName, quantity: productQuantity, unit }));
    setWaitlist([]);
    setSuggestions([]);
    setCardQuantities({});
    setName('');
    setIsProductSearchOpen(false);
  }

  function selectSuggestion(suggestion: ProductCatalogItem): void {
    setName(suggestion.name);
    setSuggestions([]);
    setIsProductSearchOpen(false);
  }

  function openQuickCreate(): void {
    if (isOffline) return;
    setQuickCreateInitialName(name.trim());
    setQuickCreateError(null);
    setQuickCreateOpen(true);
    void fetchProductCategories()
      .then((categories) => setQuickCreateCategories(categories.filter((category) => !category.isFavorite)))
      .catch(() => setQuickCreateCategories([]));
  }

  async function createQuickProduct(input: ProductCatalogInput): Promise<void> {
    setIsCreatingProduct(true);
    setQuickCreateError(null);
    try {
      const product = await createProductCatalogItem(input);
      setSuggestions((current) => applyFavoriteOverrides([product, ...current.filter((entry) => entry.id !== product.id)], favoriteOverrides));
      setQuickCreateOpen(false);
      if (pickerMode === 'cards') {
        addProductToWaitlist(product, Math.max(1, Math.round(Number(quantity) || 1)));
      } else {
        selectSuggestion(product);
      }
    } catch {
      setQuickCreateError('No se pudo crear el producto.');
    } finally {
      setIsCreatingProduct(false);
    }
  }

  async function changeFavorite(product: ProductCatalogItem, favorite: boolean): Promise<void> {
    setFavoriteOverrides((current) => ({ ...current, [product.id]: favorite }));
    setSuggestions((current) => current.map((entry) => entry.id === product.id ? { ...entry, isFavorite: favorite } : entry));
    try {
      await setProductFavorite(product.id, favorite);
    } catch {
      setFavoriteOverrides((current) => ({ ...current, [product.id]: !favorite }));
      setSuggestions((current) => current.map((entry) => entry.id === product.id ? { ...entry, isFavorite: !favorite } : entry));
    }
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
    addProductToWaitlist(suggestion, selectedQuantity);
  }

  function addProductToWaitlist(suggestion: ProductCatalogItem, selectedQuantity: number): void {
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
    if (recentlyAddedTimeoutRef.current !== null) window.clearTimeout(recentlyAddedTimeoutRef.current);
    recentlyAddedTimeoutRef.current = window.setTimeout(() => {
      setRecentlyAddedId((current) => current === suggestion.id ? null : current);
      recentlyAddedTimeoutRef.current = null;
    }, 450);
    setCardQuantities((current) => ({ ...current, [suggestion.id]: 0 }));
    setName('');
    setSuggestions([]);
    setIsProductSearchOpen(false);
  }

  function blurProductSearch(): void {
    if (document.activeElement instanceof HTMLElement && productSearchRef.current?.contains(document.activeElement)) document.activeElement.blur();
  }

  function removeFromWaitlist(productId: string): void {
    setWaitlist((current) => current.filter((product) => product.catalogProductId !== productId));
  }

  function renameList(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextName = listNameDraft.trim();
    if (isOffline || !nextName) return;
    onRenameList?.(nextName);
    setIsRenamingList(false);
  }

  return <main className={mobileSimpleActions ? 'shopping-list shopping-list--mobile-simple' : 'shopping-list'}>
    <header className="shopping-list__header">
      <div className="shopping-list__title">
        <div className="shopping-list__title-actions">
          {onDeleteList ? <button type="button" className="list-action-button list-action-button--danger" aria-label={`Eliminar lista ${title}`} disabled={isOffline} onClick={onDeleteList}>🗑</button> : null}
          {onClearChecked ? <button type="button" className="list-empty-button" aria-label={`Vaciar lista ${title}`} disabled={isOffline} onClick={onClearChecked}>Vaciar</button> : null}
        </div>
        {isRenamingList ? <form className="list-title-form" onSubmit={renameList}>
          <label className="sr-only" htmlFor="list-title-name">Nombre de la lista</label>
          <input id="list-title-name" aria-label="Nombre de la lista" disabled={isOffline} value={listNameDraft} onChange={(event) => setListNameDraft(event.target.value)} maxLength={100} autoFocus />
          <button type="submit" className="list-action-button list-action-button--save" aria-label={`Guardar nombre de ${title}`} disabled={isOffline || !listNameDraft.trim()}>✓</button>
          <button type="button" className="list-action-button" aria-label={`Cancelar cambio de nombre de ${title}`} disabled={isOffline} onClick={() => { setListNameDraft(title); setIsRenamingList(false); }}>×</button>
        </form> : <div className="list-title-display">
          <h1>{title}</h1>
          {onRenameList ? <button type="button" className="list-action-button" aria-label={`Cambiar nombre de ${title}`} disabled={isOffline} onClick={() => setIsRenamingList(true)}>✎</button> : null}
        </div>}
        {onAdd && mobileSimpleActions ? <button type="button" className="product-create-button product-create-button--header" aria-label="Crear producto" disabled={isOffline} onClick={openQuickCreate}>+</button> : null}
        {onAdd ? <ProductPickerToggle pickerMode={pickerMode} onChange={changePickerMode} /> : null}
      </div>
      {onAdd ? <>
        <div className="product-search-area" ref={productSearchRef}>
          <form className={`product-form product-form--${pickerMode}`} onSubmit={addItem}>
            <label htmlFor="new-product-name">Producto</label>
            <div className="product-autocomplete"><input id="new-product-name" disabled={isOffline} value={name} onFocus={() => setIsProductSearchOpen(true)} onChange={(event) => { setName(event.target.value); setIsProductSearchOpen(true); }} required maxLength={200} autoComplete="off" />
              {pickerMode === 'list' && isProductSearchOpen && suggestions.length ? <div className="product-suggestions" role="listbox" aria-label="Sugerencias de productos" onScroll={blurProductSearch}>{suggestions.map((suggestion) => <ProductCatalogListItem key={suggestion.id} product={suggestion} onSelect={selectSuggestion} onFavoriteChange={(product, favorite) => void changeFavorite(product, favorite)} />)}</div> : null}
            </div>
            <ManualQuantityStepper quantity={quantity} disabled={isOffline} onChange={updateManualQuantity} />
            {!mobileSimpleActions ? <button type="button" className="product-create-button product-create-button--inline" aria-label="Crear producto" disabled={isOffline} onClick={openQuickCreate}>+</button> : null}
            <button type="submit" disabled={isOffline}>Añadir</button>
          </form>
          {pickerMode === 'cards' && isProductSearchOpen && suggestions.length ? <ProductCardResults suggestions={suggestions} quantities={cardQuantities} recentlyAddedId={recentlyAddedId} onQuantityChange={updateCardQuantity} onSelect={addSuggestionToWaitlist} onFavoriteChange={(product, favorite) => void changeFavorite(product, favorite)} onScroll={blurProductSearch} /> : null}
          {pickerMode === 'cards' && waitlist.length ? <PendingProductWaitlist products={waitlist} onRemove={removeFromWaitlist} onCommit={addWaitlist} /> : null}
        </div>
        {quickCreateOpen ? <QuickProductCreateDialog initialName={quickCreateInitialName} categories={quickCreateCategories} error={quickCreateError} isSaving={isCreatingProduct} onSubmit={(input) => void createQuickProduct(input)} onClose={() => { if (!isCreatingProduct) setQuickCreateOpen(false); }} /> : null}
      </> : null}
    </header>
    {isOffline ? <p className="offline-notice" role="status">Sin conexión</p> : null}
    <ShoppingSection title="Pendientes" items={pendingItems} emptyMessage="No quedan productos pendientes." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
    <ShoppingSection title="Comprados" items={checkedItems} emptyMessage="Aún no has marcado ningún producto." isOffline={isOffline} onToggle={onToggle} onUpdate={onUpdate} onDelete={onDelete} />
  </main>;
}

function QuickProductCreateDialog({ initialName, categories, error, isSaving, onSubmit, onClose }: { initialName: string; categories: ProductCategory[]; error: string | null; isSaving: boolean; onSubmit(input: ProductCatalogInput): void; onClose(): void }): JSX.Element {
  const [productName, setProductName] = useState(initialName);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [iconKey, setIconKey] = useState('cart');
  const [brand, setBrand] = useState('');
  const [packageSize, setPackageSize] = useState('');

  useEffect(() => {
    setCategoryId((current) => current || categories[0]?.id || '');
  }, [categories]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!productName.trim()) return;
    onSubmit({
      name: productName.trim(),
      categoryId: categoryId || null,
      iconKey,
      brand: brand.trim() || null,
      packageSize: packageSize.trim() || null,
    });
  }

  return <div className="catalog-filter-backdrop" role="presentation" onClick={onClose}>
    <form className="catalog-entry-dialog quick-product-dialog" role="dialog" aria-modal="true" aria-label="Crear producto" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <header className="catalog-filter-dialog__header">
        <div><p className="eyebrow">Nuevo</p><h2>Crear producto</h2></div>
        <button className="catalog-filter-dialog__close" type="button" aria-label="Cerrar" disabled={isSaving} onClick={onClose}>&times;</button>
      </header>
      <div className="catalog-entry-fields">
        <label>Nombre del producto<input value={productName} onChange={(event) => setProductName(event.target.value)} required maxLength={120} autoFocus /></label>
        <label>Categoria<span className="catalog-select-field catalog-select-field--category">
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.length ? categories.map((category) => <option key={category.id} value={category.id}>{categoryOptionLabel(category)}</option>) : <option value="">Sin categoria</option>}
          </select>
        </span></label>
        <label>Icono<span className="catalog-select-field">
          <select value={iconKey} onChange={(event) => setIconKey(event.target.value)}>
            {catalogIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </span></label>
        <label>Marca<input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={80} placeholder="Opcional" /></label>
        <label>Tama&ntilde;o<input value={packageSize} onChange={(event) => setPackageSize(event.target.value)} maxLength={60} placeholder="Opcional" /></label>
      </div>
      {error ? <p className="quick-product-dialog__error" role="alert">{error}</p> : null}
      <div className="catalog-entry-dialog__actions">
        <button className="button button--quiet" type="button" disabled={isSaving} onClick={onClose}>Cancelar</button>
        <button className="button" type="submit" disabled={isSaving || !productName.trim()}>{isSaving ? 'Guardando...' : 'Crear'}</button>
      </div>
    </form>
  </div>;
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

function ProductCardResults({ suggestions, quantities, recentlyAddedId, onQuantityChange, onSelect, onFavoriteChange, onScroll }: { suggestions: ProductCatalogItem[]; quantities: Record<string, number>; recentlyAddedId: string | null; onQuantityChange(productId: string, delta: number): void; onSelect(suggestion: ProductCatalogItem): void; onFavoriteChange(product: ProductCatalogItem, favorite: boolean): void; onScroll(): void }): JSX.Element {
  return <section className="product-card-results" aria-label="Resultados de productos" onScroll={onScroll}>
    {suggestions.map((suggestion) => <ProductCatalogCard key={suggestion.id} product={suggestion} quantity={quantities[suggestion.id] ?? 0} recentlyAdded={recentlyAddedId === suggestion.id} onQuantityChange={onQuantityChange} onAdd={onSelect} onFavoriteChange={onFavoriteChange} />)}
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

function applyFavoriteOverrides(products: ProductCatalogItem[], overrides: Record<string, boolean>): ProductCatalogItem[] {
  return products.map((product) => product.id in overrides ? { ...product, isFavorite: overrides[product.id] } : product);
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

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    if (isOffline || !name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return;
    onUpdate?.(item, { name: name.trim(), quantity: parsedQuantity, unit: null });
    setEditing(false);
  }

  function updateEditQuantity(delta: number): void {
    setQuantity((current) => String(Math.max(1, Math.round((Number(current) || 1) + delta))));
  }

  function cancelEdit(): void {
    setName(item.name);
    setQuantity(String(item.quantity));
    setEditing(false);
  }

  return <li className={item.isChecked ? 'shopping-item shopping-item--checked' : 'shopping-item'}>
    <button type="button" className="check-button" aria-label={`${item.isChecked ? 'Desmarcar' : 'Marcar'} ${item.name}`} aria-pressed={item.isChecked} disabled={isOffline} onClick={() => onToggle?.(item)}><span aria-hidden="true">{item.isChecked ? '✓' : ''}</span></button>
    {editing ? <form onSubmit={save} className={item.isChecked ? 'product-edit-form product-edit-form--checked' : 'product-edit-form product-edit-form--pending'}>
      <label htmlFor={`edit-product-name-${item.id}`}>Nombre</label>
      <input id={`edit-product-name-${item.id}`} aria-label="Nombre del producto" disabled={isOffline} value={name} onChange={(event) => setName(event.target.value)} />
      <EditQuantityStepper itemName={item.name} quantity={quantity} disabled={isOffline} isChecked={item.isChecked} onChange={updateEditQuantity} />
      <button type="submit" className="edit-form-action edit-form-action--save" aria-label={`Guardar ${item.name}`} disabled={isOffline}>Guardar</button>
      <button type="button" className="edit-form-action edit-form-action--cancel" aria-label={`Cancelar edición de ${item.name}`} disabled={isOffline} onClick={cancelEdit}>Cancelar</button>
    </form> : <><span className="shopping-item__name">{item.name}</span><span className="shopping-item__quantity">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span></>}
    {onUpdate && !editing ? <button type="button" className="item-action item-action--edit" aria-label={`Editar ${item.name}`} aria-pressed="false" disabled={isOffline} onClick={() => setEditing(true)}>✎</button> : null}
    {onDelete ? <button type="button" className="item-action item-action--delete" aria-label={`Eliminar ${item.name}`} disabled={isOffline} onClick={() => onDelete(item)}>×</button> : null}
  </li>;
}

function EditQuantityStepper({ itemName, quantity, disabled, isChecked, onChange }: { itemName: string; quantity: string; disabled: boolean; isChecked: boolean; onChange(delta: number): void }): JSX.Element {
  return <div className={isChecked ? 'edit-quantity-stepper edit-quantity-stepper--checked' : 'edit-quantity-stepper edit-quantity-stepper--pending'} role="group" aria-label={`Cantidad de ${itemName}`}>
    <button type="button" aria-label={`Reducir cantidad de ${itemName}`} disabled={disabled || Number(quantity) <= 1} onClick={() => onChange(-1)}>−</button>
    <span aria-label={`Cantidad seleccionada de ${itemName}`}>{quantity}</span>
    <button type="button" aria-label={`Aumentar cantidad de ${itemName}`} disabled={disabled} onClick={() => onChange(1)}>+</button>
  </div>;
}
