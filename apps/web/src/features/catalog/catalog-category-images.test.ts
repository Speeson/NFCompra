import { describe, expect, it } from 'vitest';

import { catalogCategoryImageSource } from './catalog-category-images';

describe('catalogCategoryImageSource', () => {
  it('maps a system category to its catalog photograph', () => {
    expect(catalogCategoryImageSource('aceite, especias y salsas')).toBe('/catalog-images/catalog_aceite_especias_y_salsas.webp');
  });

  it('leaves custom categories without a photograph on the icon fallback', () => {
    expect(catalogCategoryImageSource('productos de casa')).toBeNull();
  });
});
