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
  onOpenActions,
}: {
  product: ProductCatalogItem;
  quantity?: number;
  disabled?: boolean;
  recentlyAdded?: boolean;
  statusLabel?: string | null;
  onQuantityChange?(productId: string, delta: number): void;
  onAdd?(product: ProductCatalogItem): void;
  onFavoriteChange?(product: ProductCatalogItem, favorite: boolean): void;
  onOpenActions?(product: ProductCatalogItem): void;
}): JSX.Element {
  const selectedQuantity = quantity ?? 0;
  const hasQuantity = Boolean(onQuantityChange);
  const canAdd = !disabled && (!hasQuantity || selectedQuantity > 0);
  const visibleStatus = hasQuantity ? selectedQuantity > 0 ? `x${selectedQuantity}` : 'Elige cantidad' : statusLabel === undefined ? product.categoryName ?? 'Producto' : statusLabel;
  const cardClassName = [
    'product-result-card',
    hasQuantity ? 'product-result-card--picker' : null,
    recentlyAdded ? 'product-result-card--added' : null,
    product.isFavorite ? 'product-result-card--favorite' : null,
  ].filter(Boolean).join(' ');

  if (hasQuantity) {
    return <article className={cardClassName} aria-label={product.name}>
      <span className="product-result-card__content">
        <strong>{product.name}</strong>
        <small>{productDetails(product)}</small>
      </span>
      <div className="product-result-card__quantity" aria-label={`Cantidad de ${product.name}`}>
        <button type="button" aria-label={`Reducir cantidad de ${product.name}`} disabled={disabled || selectedQuantity === 0} onClick={() => onQuantityChange?.(product.id, -1)}>−</button>
        <span>{selectedQuantity}</span>
        <button type="button" aria-label={`Aumentar cantidad de ${product.name}`} disabled={disabled} onClick={() => onQuantityChange?.(product.id, 1)}>+</button>
      </div>
      <div className="product-result-card__footer">
        <button type="button" className="product-result-card__add" aria-label={`Seleccionar ${product.name}`} disabled={!canAdd} onClick={() => onAdd?.(product)}>A&ntilde;adir</button>
        <button
          type="button"
          className={product.isFavorite ? 'product-favorite-button is-favorite' : 'product-favorite-button'}
          aria-label={`${product.isFavorite ? 'Quitar' : 'A\u00f1adir'} ${product.name} de favoritos`}
          aria-pressed={Boolean(product.isFavorite)}
          disabled={disabled}
          onClick={() => onFavoriteChange?.(product, !product.isFavorite)}
        >{product.isFavorite ? '\u2605' : '\u2606'}</button>
      </div>
    </article>;
  }

  return <article className={cardClassName} aria-label={product.name}>
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
      {onOpenActions ? <button
        type="button"
        className="product-result-card__actions"
        aria-label={`Acciones de producto ${product.name}`}
        onClick={() => onOpenActions(product)}
      >⋯</button> : null}
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
  const accessibleName = details ? `${product.name} \u00b7 ${details}` : product.name;
  return <div className="product-suggestion-row" role="option" aria-selected="false">
    <div className="product-suggestion">
      <button
        type="button"
        className={product.isFavorite ? 'product-favorite-button product-favorite-button--compact is-favorite' : 'product-favorite-button product-favorite-button--compact'}
        aria-label={`${product.isFavorite ? 'Quitar' : 'A\u00f1adir'} ${product.name} de favoritos`}
        aria-pressed={Boolean(product.isFavorite)}
        disabled={disabled}
        onClick={() => onFavoriteChange?.(product, !product.isFavorite)}
      >{product.isFavorite ? '\u2605' : '\u2606'}</button>
      <button type="button" className="product-suggestion__select" aria-label={accessibleName} disabled={disabled} onClick={() => onSelect(product)}>
        <span>{product.name}</span>
        <small>{details}</small>
      </button>
    </div>
  </div>;
}
export function productDetails(product: ProductCatalogItem): string {
  return [product.categoryName, product.packageSize].filter(Boolean).join(' \u00b7 ');
}

export function productIcon(product: ProductCatalogItem): string {
  const iconKey = normalized(product.iconKey);
  const name = normalized(product.name);
  const category = normalized(product.categoryName ?? '');
  return iconFromText(`${iconKey === 'shopping-basket' ? '' : iconKey} ${name}`) ?? iconFromText(category) ?? '🛒';
}

function iconFromText(text: string): string | null {
  if (text.includes('arroz') || text.includes('rice')) return '🍚';
  if (text.includes('pasta') || text.includes('macarron') || text.includes('espagueti') || text.includes('tallar')) return '🍝';
  if (text.includes('alubia') || text.includes('judia') || text.includes('garbanzo') || text.includes('lenteja') || text.includes('legumbre')) return '🫘';
  if (text.includes('cacao') || text.includes('chocolate') || text.includes('bombon')) return '🍫';
  if (text.includes('cafe') || text.includes('infusion') || text.includes(' tea') || text.includes(' te ')) return '☕';
  if (text.includes('salsa') || text.includes('mayonesa') || text.includes('mostaza') || text.includes('ketchup')) return '🫙';
  if (text.includes('aceite') || text.includes('oliva') || text.includes('aceituna')) return '🫒';
  if (text.includes('huevo') || text.includes('egg')) return '🥚';
  if (text.includes('queso') || text.includes('cheese')) return '🧀';
  if (text.includes('mantequilla') || text.includes('butter')) return '🧈';
  if (text.includes('harina') || text.includes('flour')) return '🌾';
  if (text.includes('sal') || text.includes('especia') || text.includes('pimienta')) return '🧂';
  if (text.includes('galleta') || text.includes('cereal')) return '🍪';
  if (text.includes('azucar') || text.includes('caramelo') || text.includes('dulce')) return '🍬';
  if (text.includes('postre') || text.includes('flan') || text.includes('natilla')) return '🍮';
  if (text.includes('helado') || text.includes('congelado') || text.includes('frozen')) return '🧊';
  if (text.includes('pizza')) return '🍕';
  if (text.includes('sopa') || text.includes('caldo') || text.includes('crema')) return '🥣';
  if (text.includes('atun') || text.includes('pescado') || text.includes('marisco') || text.includes('fish')) return '🐟';
  if (text.includes('pan') || text.includes('bolleria') || text.includes('bread')) return '🥖';
  if (text.includes('leche') || text.includes('lacteo') || text.includes('yogur') || text.includes('milk')) return '🥛';
  if (text.includes('tomate')) return '🍅';
  if (text.includes('patata') || text.includes('papa')) return '🥔';
  if (text.includes('cebolla')) return '🧅';
  if (text.includes('ajo')) return '🧄';
  if (text.includes('platano') || text.includes('banana')) return '🍌';
  if (text.includes('naranja') || text.includes('mandarina')) return '🍊';
  if (text.includes('limon')) return '🍋';
  if (text.includes('fruta') || text.includes('manzana') || text.includes('apple')) return '🍎';
  if (text.includes('verdura') || text.includes('zanahoria') || text.includes('carrot')) return '🥕';
  if (text.includes('carne') || text.includes('pollo') || text.includes('meat')) return '🥩';
  if (text.includes('salchicha') || text.includes('chorizo') || text.includes('jamon') || text.includes('charcuteria')) return '🥓';
  if (text.includes('agua') || text.includes('bebida') || text.includes('refresco') || text.includes('bottle')) return '💧';
  if (text.includes('zumo') || text.includes('jugo')) return '🧃';
  if (text.includes('vino') || text.includes('bodega')) return '🍷';
  if (text.includes('cerveza')) return '🍺';
  if (text.includes('snack') || text.includes('aperitivo') || text.includes('patatas fritas')) return '🥨';
  if (text.includes('limpieza') || text.includes('drogueria')) return '🧽';
  if (text.includes('detergente') || text.includes('lavavajillas')) return '🧼';
  if (text.includes('papel') || text.includes('servilleta') || text.includes('panuelo')) return '🧻';
  if (text.includes('higiene') || text.includes('gel') || text.includes('champu') || text.includes('jabon')) return '🧴';
  if (text.includes('mascota') || text.includes('perro') || text.includes('gato')) return '🐾';
  if (text.includes('conserva')) return '🥫';
  return null;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
