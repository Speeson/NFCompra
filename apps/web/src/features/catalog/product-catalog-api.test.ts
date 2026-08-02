import { afterEach, expect, it, vi } from 'vitest';

import { searchProductCatalog } from './product-catalog-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('falls back to the production API when same-origin catalog lookup is not available', async () => {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('/v1/product-catalog?')) {
      return Promise.resolve(Response.json({ error: { code: 'NOT_FOUND', message: 'No encontrado.', details: {} } }, { status: 404 }));
    }
    if (url.startsWith('https://api.nfcompra.esgarpe.dev/v1/product-catalog?')) {
      return Promise.resolve(Response.json({
        products: [{
          id: 'prod-milk',
          name: 'Leche entera',
          normalizedName: 'leche entera',
          categoryId: 'cat-dairy',
          categoryName: 'Lácteos',
          iconKey: 'milk',
          brand: null,
          packageSize: '1 L',
          source: 'supermercados-espana',
          sourceProductId: 'milk-1',
        }],
      }));
    }
    throw new Error(`Solicitud inesperada: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(searchProductCatalog('leche')).resolves.toMatchObject([{ name: 'Leche entera' }]);
});
