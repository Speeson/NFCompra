import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProductCatalogCard, productIcon } from './ProductCatalogCards';
import type { ProductCatalogItem } from './product-catalog-api';

describe('ProductCatalogCard', () => {
  it('uses the search picker card structure when quantity controls are enabled', () => {
    render(<ProductCatalogCard
      product={{
        id: 'prod-tomato',
        name: 'Tomate frito estilo casero Hacendado',
        normalizedName: 'tomate frito estilo casero hacendado',
        categoryId: 'cat-sauces',
        categoryName: 'Aceite, especias y salsas',
        iconKey: 'shopping-basket',
        brand: null,
        packageSize: 'Brik',
        source: null,
        sourceProductId: null,
        isFavorite: false,
      }}
      quantity={0}
      onQuantityChange={() => undefined}
    />);

    const card = screen.getByRole('article', { name: 'Tomate frito estilo casero Hacendado' });
    expect(card).toHaveClass('product-result-card--picker');
    expect(card.querySelector('.product-result-card__quantity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seleccionar Tomate frito estilo casero Hacendado' })).toBeDisabled();
  });

  it('uses specific supermarket icons for common grocery products', () => {
    expect(productIcon(product({ name: 'Arroz redondo', categoryName: 'Arroz, pasta y legumbres' }))).toBe('🍚');
    expect(productIcon(product({ name: 'Alubia blanca cocida', categoryName: 'Conservas, caldos y cremas' }))).toBe('🫘');
    expect(productIcon(product({ name: 'Cacao soluble', categoryName: 'Cacao, cafe e infusiones' }))).toBe('🍫');
    expect(productIcon(product({ name: 'Aceite de oliva virgen extra', categoryName: 'Aceite, especias y salsas' }))).toBe('🫒');
    expect(productIcon(product({ name: 'Huevos camperos', categoryName: 'Huevos' }))).toBe('🥚');
    expect(productIcon(product({ name: 'Queso semicurado', categoryName: 'Charcuteria y quesos' }))).toBe('🧀');
    expect(productIcon(product({ name: 'Tomate frito estilo casero', categoryName: 'Aceite, especias y salsas' }))).toBe('🍅');
    expect(productIcon(product({ name: 'Pan de leche', categoryName: 'Lacteos' }))).toBe('🥖');
  });
});

function product(overrides: Partial<ProductCatalogItem>): ProductCatalogItem {
  return {
    id: 'prod-test',
    name: 'Producto',
    normalizedName: 'producto',
    categoryId: 'cat-test',
    categoryName: null,
    iconKey: 'shopping-basket',
    brand: null,
    packageSize: null,
    source: null,
    sourceProductId: null,
    isFavorite: false,
    ...overrides,
  };
}
