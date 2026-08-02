import { describe, expect, it } from 'vitest';

import { buildCatalogImportSql, catalogRecordsFromJson, normalizeCatalogImport } from '../src/catalog/importer';

describe('catalog importer', () => {
  it('normalizes supermarket products into deterministic categories, products and aliases', () => {
    const result = normalizeCatalogImport([
      {
        name: 'Leche entera',
        category: 'Lácteos',
        brand: 'Marca blanca',
        packageSize: '1 L',
        source: 'spanish-supermarkets',
        sourceProductId: 'milk-1',
        aliases: ['leche normal', 'leche'],
      },
      {
        name: 'Pan integral',
        category: 'Panadería',
        sourceProductId: 'bread-1',
      },
    ], { defaultSource: 'manual' });

    expect(result.categories).toEqual([
      expect.objectContaining({ id: 'cat-lacteos', name: 'Lácteos', normalizedName: 'lacteos' }),
      expect.objectContaining({ id: 'cat-panaderia', name: 'Panadería', normalizedName: 'panaderia' }),
    ]);
    expect(result.products).toEqual([
      expect.objectContaining({ id: 'prod-spanish-supermarkets-milk-1', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-lacteos', brand: 'Marca blanca', packageSize: '1 L', source: 'spanish-supermarkets' }),
      expect.objectContaining({ id: 'prod-manual-bread-1', name: 'Pan integral', normalizedName: 'pan integral', categoryId: 'cat-panaderia', source: 'manual' }),
    ]);
    expect(result.aliases).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: 'prod-spanish-supermarkets-milk-1', alias: 'leche normal', normalizedAlias: 'leche normal' }),
      expect.objectContaining({ productId: 'prod-spanish-supermarkets-milk-1', alias: 'leche', normalizedAlias: 'leche' }),
    ]));
  });

  it('builds idempotent SQL for D1 import without external images or pricing fields', () => {
    const sql = buildCatalogImportSql(normalizeCatalogImport([
      { name: "Tomate frito 0'0", category: 'Conservas', sourceProductId: 'tomate-1' },
    ], { defaultSource: 'manual' }));

    expect(sql).toContain('INSERT INTO product_categories');
    expect(sql).toContain('INSERT INTO product_catalog');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain("Tomate frito 0''0");
    expect(sql).not.toContain('image');
    expect(sql).not.toContain('price');
  });

  it('can omit transaction statements for remote D1 execute imports', () => {
    const sql = buildCatalogImportSql(normalizeCatalogImport([
      { name: 'Leche entera', category: 'Lácteos', sourceProductId: 'leche-1' },
    ], { defaultSource: 'manual' }), { transaction: false });

    expect(sql).not.toContain('BEGIN TRANSACTION;');
    expect(sql).not.toContain('COMMIT;');
    expect(sql).toContain('INSERT INTO product_catalog');
  });

  it('maps exported supermarket JSON fields into generic catalog records', () => {
    expect(catalogRecordsFromJson({
      results: [{
        id: '10005',
        display_name: 'Aceite de oliva virgen extra',
        category_name: 'Aceite, especias y salsas',
        brand: 'Marca blanca',
        price_instructions: { unit_size: '1 L' },
      }],
    }, { defaultSource: 'supermercados-espana' })).toEqual([{
      name: 'Aceite de oliva virgen extra',
      category: 'Aceite, especias y salsas',
      brand: 'Marca blanca',
      packageSize: '1 L',
      source: 'supermercados-espana',
      sourceProductId: '10005',
      aliases: [],
    }]);
  });
});
