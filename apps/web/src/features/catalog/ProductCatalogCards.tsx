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
  const keyText = ['shopping-basket', 'general', 'cart'].includes(iconKey) ? '' : iconKey;
  return iconFromText(`${keyText} ${name}`) ?? iconFromText(category) ?? '\uD83D\uDED2';
}

function iconFromText(text: string): string | null {
  if (text.includes('panal') || text.includes('panales') || text.includes('diaper')) return '\uD83E\uDDF7';
  if (text.includes('refresco') || text.includes('gaseosa') || text.includes('soft-drink') || text.includes('coca-cola')) return '\uD83E\uDD64';
  if (text.includes('agua mineral') || text.includes('agua con gas') || text.includes('agua de soda') || text.includes('agua de coco') || text.includes('agua destilada') || text.includes('water') || text.includes('bottle')) return '\uD83D\uDCA7';
  if (text.includes('zumo') || text.includes('jugo') || text.includes('juice')) return '\uD83E\uDDC3';
  if (text.includes('vino') || text.includes('bodega') || text.includes('wine')) return '\uD83C\uDF77';
  if (text.includes('cerveza') || text.includes('beer')) return '\uD83C\uDF7A';
  if (text.includes('cafe') || text.includes('infusion') || text.includes('coffee') || text.includes(' tea') || text.includes(' te ')) return '\u2615';
  if (text.includes('bebida') || text.includes('drink')) return '\uD83E\uDD64';
  if (text.includes('acondicionador') || text.includes('pantene') || text.includes('cabello') || text.includes('capilar') || text.includes('hair-care')) return '\uD83E\uDDF4';
  if (text.includes('arroz') || text.includes('rice')) return '\uD83C\uDF5A';
  if (text.includes('pasta') || text.includes('macarron') || text.includes('espagueti') || text.includes('tallar')) return '\uD83C\uDF5D';
  if (text.includes('alubia') || text.includes('judia') || text.includes('garbanzo') || text.includes('lenteja') || text.includes('legumbre') || text.includes('beans')) return '\uD83E\uDED8';
  if (text.includes('cacao') || text.includes('chocolate') || text.includes('bombon')) return '\uD83C\uDF6B';
  if (text.includes('salsa') || text.includes('sauce') || text.includes('mayonesa') || text.includes('mostaza') || text.includes('ketchup')) return '\uD83E\uDED9';
  if (text.includes('aceite') || text.includes('oliva') || text.includes('aceituna')) return '\uD83E\uDED2';
  if (text.includes('huevo') || text.includes('egg')) return '\uD83E\uDD5A';
  if (text.includes('queso') || text.includes('cheese')) return '\uD83E\uDDC0';
  if (text.includes('mantequilla') || text.includes('butter')) return '\uD83E\uDDC8';
  if (text.includes('harina') || text.includes('flour')) return '\uD83C\uDF3E';
  if (hasWord(text, 'sal') || text.includes('especia') || text.includes('pimienta')) return '\uD83E\uDDC2';
  if (text.includes('galleta') || text.includes('cereal') || text.includes('cookie')) return '\uD83C\uDF6A';
  if (text.includes('azucar') || text.includes('caramelo') || text.includes('dulce') || text.includes('candy')) return '\uD83C\uDF6C';
  if (text.includes('postre') || text.includes('flan') || text.includes('natilla') || text.includes('dessert')) return '\uD83C\uDF6E';
  if (text.includes('helado') || text.includes('congelado') || text.includes('frozen')) return '\uD83E\uDDCA';
  if (text.includes('pizza')) return '\uD83C\uDF55';
  if (text.includes('sopa') || text.includes('caldo') || text.includes('crema')) return '\uD83E\uDD63';
  if (text.includes('atun') || text.includes('pescado') || text.includes('marisco') || text.includes('fish')) return '\uD83D\uDC1F';
  if (hasWord(text, 'pan') || text.includes('panaderia') || text.includes('panecillo') || text.includes('bolleria') || text.includes('bread')) return '\uD83E\uDD56';
  if (text.includes('leche') || text.includes('lacteo') || text.includes('yogur') || text.includes('milk')) return '\uD83E\uDD5B';
  if (text.includes('tomate')) return '\uD83C\uDF45';
  if (text.includes('patata') || text.includes('papa')) return '\uD83E\uDD54';
  if (text.includes('cebolla')) return '\uD83E\uDDC5';
  if (text.includes('ajo')) return '\uD83E\uDDC4';
  if (text.includes('platano') || text.includes('banana')) return '\uD83C\uDF4C';
  if (text.includes('naranja') || text.includes('mandarina')) return '\uD83C\uDF4A';
  if (text.includes('limon')) return '\uD83C\uDF4B';
  if (text.includes('fruta') || text.includes('manzana') || text.includes('apple')) return '\uD83C\uDF4E';
  if (text.includes('verdura') || text.includes('zanahoria') || text.includes('carrot')) return '\uD83E\uDD55';
  if (text.includes('carne') || text.includes('pollo') || text.includes('meat')) return '\uD83E\uDD69';
  if (text.includes('salchicha') || text.includes('chorizo') || text.includes('jamon') || text.includes('charcuteria') || text.includes('cold-cuts')) return '\uD83E\uDD53';
  if (text.includes('snack') || text.includes('aperitivo') || text.includes('patatas fritas')) return '\uD83E\uDD68';
  if (text.includes('limpieza') || text.includes('drogueria')) return '\uD83E\uDDFD';
  if (text.includes('detergente') || text.includes('detergent') || text.includes('lavavajillas')) return '\uD83E\uDDFC';
  if (text.includes('papel') || text.includes('paper') || text.includes('servilleta') || text.includes('panuelo')) return '\uD83E\uDDFB';
  if (text.includes('higiene') || text.includes('gel') || text.includes('champu') || text.includes('jabon')) return '\uD83E\uDDF4';
  if (text.includes('maquillaje') || text.includes('makeup')) return '\uD83D\uDC84';
  if (text.includes('bebe') || text.includes('baby')) return '\uD83C\uDF7C';
  if (text.includes('mascota') || text.includes('perro') || text.includes('gato')) return '\uD83D\uDC3E';
  if (text.includes('conserva') || text.includes('can')) return '\uD83E\uDD6B';
  return null;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);
}
