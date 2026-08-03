import { afterEach, expect, it, vi } from 'vitest';

import { clearProductCatalogCacheForTests, searchProductCatalog } from './product-catalog-api';

afterEach(() => {
  clearProductCatalogCacheForTests();
  vi.unstubAllGlobals();
});

it('searches a cached snapshot locally instead of calling the remote search endpoint for every query', async () => {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('/v1/product-catalog/snapshot')) {
      return Promise.resolve(Response.json({
        version: 'v1',
        productCount: 2,
        products: [{
          id: 'prod-milk',
          name: 'Leche entera',
          normalizedName: 'leche entera',
          categoryId: 'cat-dairy',
          categoryName: 'Lacteos',
          iconKey: 'milk',
          brand: null,
          packageSize: '1 L',
          source: 'supermercados-espana',
          sourceProductId: 'milk-1',
        }, {
          id: 'prod-bread',
          name: 'Pan integral',
          normalizedName: 'pan integral',
          categoryId: 'cat-bread',
          categoryName: 'Panaderia',
          iconKey: 'bread',
          brand: null,
          packageSize: '500 g',
          source: 'supermercados-espana',
          sourceProductId: 'bread-1',
        }],
      }));
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(searchProductCatalog('lech')).resolves.toMatchObject([{ name: 'Leche entera' }]);
  await expect(searchProductCatalog('pan')).resolves.toMatchObject([{ name: 'Pan integral' }]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/v1/product-catalog/snapshot', expect.any(Object));
});
