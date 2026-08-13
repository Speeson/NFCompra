import { describe, expect, it } from 'vitest';

import { buildCatalogImportSql, catalogRecordsFromJson, cleanDisplayText, normalizeCatalogImport } from '../src/catalog/importer';

describe('catalog importer', () => {
  it('normalizes supermarket products into deterministic accent-free categories, products and aliases', () => {
    const result = normalizeCatalogImport([
      {
        name: 'Leche entera',
        category: 'LÃ¡cteos',
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
      expect.objectContaining({ id: 'cat-huevos-leche-y-mantequilla', name: 'Huevos, leche y mantequilla', normalizedName: 'huevos, leche y mantequilla' }),
      expect.objectContaining({ id: 'cat-panaderia-y-pasteleria', name: 'Panaderia y pasteleria', normalizedName: 'panaderia y pasteleria' }),
    ]);
    expect(result.products).toEqual([
      expect.objectContaining({ id: 'prod-spanish-supermarkets-milk-1', name: 'Leche entera', normalizedName: 'leche entera', categoryId: 'cat-huevos-leche-y-mantequilla', brand: 'Marca blanca', packageSize: '1 L', source: 'spanish-supermarkets' }),
      expect.objectContaining({ id: 'prod-manual-bread-1', name: 'Pan integral', normalizedName: 'pan integral', categoryId: 'cat-panaderia-y-pasteleria', source: 'manual' }),
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
    expect(sql).toContain('Huevos, leche y mantequilla');
  });

  it('repairs mojibake and strips accents from display text', () => {
    expect(cleanDisplayText('LÃ¡cteos')).toBe('Lacteos');
    expect(cleanDisplayText('Panadería')).toBe('Panaderia');
    expect(cleanDisplayText('Café, cacao e infusiones')).toBe('Cafe, cacao e infusiones');
  });

  it('merges small duplicate categories into the larger catalog categories', () => {
    const result = normalizeCatalogImport([
      { name: 'Barra de pan', category: 'Panaderia', sourceProductId: 'pan-1' },
      { name: 'Macarrones', category: 'Arroz, pasta y legumbres', sourceProductId: 'pasta-1' },
      { name: 'Champu familiar', category: 'Perfumeria e higiene', sourceProductId: 'champu-1' },
      { name: 'Queso rallado', category: 'Lacteos', sourceProductId: 'queso-1' },
      { name: 'Yogur natural', category: 'Lacteos', sourceProductId: 'yogur-1' },
      { name: 'Leche entera', category: 'Lacteos', sourceProductId: 'leche-1' },
    ], { defaultSource: 'manual' });

    expect(result.categories.map((category) => category.name)).toEqual([
      'Arroz, legumbres y pasta',
      'Charcuteria y quesos',
      'Cuidado del cabello',
      'Huevos, leche y mantequilla',
      'Panaderia y pasteleria',
      'Postres y yogures',
    ]);
    expect(result.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Barra de pan', categoryId: 'cat-panaderia-y-pasteleria' }),
      expect.objectContaining({ name: 'Queso rallado', categoryId: 'cat-charcuteria-y-quesos' }),
      expect.objectContaining({ name: 'Yogur natural', categoryId: 'cat-postres-y-yogures' }),
      expect.objectContaining({ name: 'Leche entera', categoryId: 'cat-huevos-leche-y-mantequilla' }),
    ]));
  });

  it('infers specific product icons before falling back to the generic cart', () => {
    const result = normalizeCatalogImport([
      { name: 'Arroz redondo', category: 'Arroz, legumbres y pasta', sourceProductId: 'arroz-1' },
      { name: 'Atun claro en aceite', category: 'Conservas, caldos y cremas', sourceProductId: 'atun-1' },
      { name: 'Papel higienico', category: 'Limpieza y hogar', sourceProductId: 'papel-1' },
      { name: 'Capsulas Probiotico Deliplus', category: 'Fitoterapia y parafarmacia', sourceProductId: 'probiotico-1' },
      { name: 'Preservativos sensitive On', category: 'Fitoterapia y parafarmacia', sourceProductId: 'preservativo-1' },
      { name: 'Spray repelente fuerte Deliplus antimosquitos', category: 'Fitoterapia y parafarmacia', sourceProductId: 'repelente-1' },
      { name: 'Panales bebe talla 4 Deliplus', category: 'Bebe', sourceProductId: 'panales-1' },
      { name: 'Acondicionador Repara & Protege Pantene', category: 'Perfumeria e higiene', sourceProductId: 'pantene-1' },
      { name: 'Refresco Coca-Cola zero azucar zero cafeina', category: 'Bebidas', sourceProductId: 'refresco-1' },
      { name: 'Agua mineral grande Bezoya', category: 'Bebidas', sourceProductId: 'agua-1' },
      { name: 'Bebida energetica Furious Energy drink Hacendado', category: 'Bebidas', sourceProductId: 'bebida-1' },
      { name: 'Bebida de avena con cafe Hacendado', category: 'Bebidas', sourceProductId: 'cafe-1' },
      { name: 'Cafe molido natural Hacendado', category: 'Cacao, cafe e infusiones', sourceProductId: 'category-cafe-1' },
      { name: 'Pan de leche', category: 'Panaderia', sourceProductId: 'pan-leche-1' },
    ], { defaultSource: 'manual' });

    expect(result.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Arroz redondo', iconKey: 'rice' }),
      expect.objectContaining({ name: 'Atun claro en aceite', iconKey: 'fish' }),
      expect.objectContaining({ name: 'Papel higienico', iconKey: 'paper' }),
      expect.objectContaining({ name: 'Capsulas Probiotico Deliplus', iconKey: 'supplement' }),
      expect.objectContaining({ name: 'Preservativos sensitive On', iconKey: 'condom' }),
      expect.objectContaining({ name: 'Spray repelente fuerte Deliplus antimosquitos', iconKey: 'repellent' }),
      expect.objectContaining({ name: 'Panales bebe talla 4 Deliplus', iconKey: 'diaper' }),
      expect.objectContaining({ name: 'Acondicionador Repara & Protege Pantene', iconKey: 'hair-care' }),
      expect.objectContaining({ name: 'Refresco Coca-Cola zero azucar zero cafeina', iconKey: 'soft-drink' }),
      expect.objectContaining({ name: 'Agua mineral grande Bezoya', iconKey: 'water' }),
      expect.objectContaining({ name: 'Bebida energetica Furious Energy drink Hacendado', iconKey: 'drink' }),
      expect.objectContaining({ name: 'Bebida de avena con cafe Hacendado', iconKey: 'coffee' }),
      expect.objectContaining({ name: 'Pan de leche', iconKey: 'bread' }),
    ]));
    expect(result.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Agua y refrescos', iconKey: 'water' }),
      expect.objectContaining({ name: 'Bebe', iconKey: 'baby' }),
      expect.objectContaining({ name: 'Cacao, cafe e infusiones', iconKey: 'coffee' }),
    ]));
    expect(result.products.map((product) => product.iconKey)).not.toContain('shopping-basket');
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
      sourceCategoryId: null,
      aliases: [],
    }]);
  });
});
