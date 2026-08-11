import type { JSX } from 'react';

import type { ProductCatalogItem } from './product-catalog-api';

export function ProductCatalogCard({
  product,
  quantity,
  disabled = false,
  recentlyAdded = false,
  statusLabel,
  onQuantityChange,
  onAdd,
  onFavoriteChange,
}: {
  product: ProductCatalogItem;
  quantity?: number;
  disabled?: boolean;
  recentlyAdded?: boolean;
  statusLabel?: string | null;
  onQuantityChange?(productId: string, delta: number): void;
  onAdd?(product: ProductCatalogItem): void;
  onFavoriteChange?(product: ProductCatalogItem, favorite: boolean): void;
}): JSX.Element {
  const selectedQuantity = quantity ?? 0;
  const hasQuantity = Boolean(onQuantityChange);
  const canAdd = !disabled && (!hasQuantity || selectedQuantity > 0);
  const visibleStatus = hasQuantity ? selectedQuantity > 0 ? `x${selectedQuantity}` : 'Elige cantidad' : statusLabel === undefined ? product.categoryName ?? 'Producto' : statusLabel;
  return <article className={recentlyAdded ? 'product-result-card product-result-card--added' : product.isFavorite ? 'product-result-card product-result-card--favorite' : 'product-result-card'} aria-label={product.name}>
    <div className="product-result-card__rail">
      <span className="product-result-card__icon" aria-hidden="true">{productIcon(product)}</span>
      <button
        type="button"
        className={product.isFavorite ? 'product-favorite-button is-favorite' : 'product-favorite-button'}
        aria-label={`${product.isFavorite ? 'Quitar' : 'Añadir'} ${product.name} de favoritos`}
        aria-pressed={Boolean(product.isFavorite)}
        disabled={disabled}
        onClick={() => onFavoriteChange?.(product, !product.isFavorite)}
      >{product.isFavorite ? '★' : '☆'}</button>
    </div>
    <button type="button" className="product-result-card__main" aria-label={`Seleccionar ${product.name}`} disabled={!canAdd} onClick={() => onAdd?.(product)}>
      <span className="product-result-card__content"><strong>{product.name}</strong><small>{productDetails(product)}</small></span>
      {visibleStatus ? <span className="product-result-card__status">{visibleStatus}</span> : null}
    </button>
    {hasQuantity ? <div className="product-result-card__quantity" aria-label={`Cantidad de ${product.name}`}>
      <button type="button" aria-label={`Reducir cantidad de ${product.name}`} disabled={disabled || selectedQuantity === 0} onClick={() => onQuantityChange?.(product.id, -1)}>−</button>
      <span>{selectedQuantity}</span>
      <button type="button" aria-label={`Aumentar cantidad de ${product.name}`} disabled={disabled} onClick={() => onQuantityChange?.(product.id, 1)}>+</button>
    </div> : null}
  </article>;
}

export function ProductCatalogListItem({
  product,
  disabled = false,
  onSelect,
  onFavoriteChange,
}: {
  product: ProductCatalogItem;
  disabled?: boolean;
  onSelect(product: ProductCatalogItem): void;
  onFavoriteChange?(product: ProductCatalogItem, favorite: boolean): void;
}): JSX.Element {
  const details = productDetails(product);
  const accessibleName = details ? `${product.name} · ${details}` : product.name;
  return <div className="product-suggestion-row" role="option" aria-selected="false">
    <button type="button" className="product-suggestion product-suggestion--with-favorite" aria-label={accessibleName} disabled={disabled} onClick={() => onSelect(product)}>
      <span>{product.name}</span>
      <small>{details}</small>
    </button>
    <button
      type="button"
      className={product.isFavorite ? 'product-favorite-button product-favorite-button--compact is-favorite' : 'product-favorite-button product-favorite-button--compact'}
      aria-label={`${product.isFavorite ? 'Quitar' : 'Añadir'} ${product.name} de favoritos`}
      aria-pressed={Boolean(product.isFavorite)}
      disabled={disabled}
      onClick={() => onFavoriteChange?.(product, !product.isFavorite)}
    >{product.isFavorite ? '★' : '☆'}</button>
  </div>;
}

export function productDetails(product: ProductCatalogItem): string {
  return [product.categoryName, product.packageSize].filter(Boolean).join(' · ');
}

export function productIcon(product: ProductCatalogItem): string {
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
