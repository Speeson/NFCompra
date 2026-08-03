import { normalizedName } from '../lists/validation.ts';

export interface CatalogImportInput {
  name: string;
  category: string;
  brand?: string | null;
  packageSize?: string | null;
  source?: string | null;
  sourceProductId?: string | null;
  sourceCategoryId?: string | null;
  aliases?: string[];
  iconKey?: string | null;
}

interface ImportJsonOptions {
  defaultSource: string;
  fallbackCategory?: string;
}

export interface NormalizedCatalogCategory {
  id: string;
  name: string;
  normalizedName: string;
  iconKey: string;
  source: string | null;
  sourceCategoryId: string | null;
}

export interface NormalizedCatalogProduct {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  iconKey: string;
  brand: string | null;
  packageSize: string | null;
  source: string;
  sourceProductId: string;
}

export interface NormalizedCatalogAlias {
  id: string;
  productId: string;
  alias: string;
  normalizedAlias: string;
}

export interface NormalizedCatalogImport {
  categories: NormalizedCatalogCategory[];
  products: NormalizedCatalogProduct[];
  aliases: NormalizedCatalogAlias[];
}

export function normalizeCatalogImport(records: CatalogImportInput[], options: { defaultSource: string }): NormalizedCatalogImport {
  const categories = new Map<string, NormalizedCatalogCategory>();
  const products = new Map<string, NormalizedCatalogProduct>();
  const aliases = new Map<string, NormalizedCatalogAlias>();

  for (const record of records) {
    const name = cleanDisplayText(record.name);
    const categoryName = cleanDisplayText(record.category);
    if (!name || !categoryName) continue;
    const source = clean(record.source) || options.defaultSource;
    const sourceProductId = clean(record.sourceProductId) || slug(name);
    const sourceCategoryId = clean(record.sourceCategoryId) || categoryIdFrom(categoryName, source);
    const categoryNormalized = normalizedName(categoryName);
    const categoryId = `cat-${slug(categoryName)}`;
    const productId = `prod-${slug(source)}-${slug(sourceProductId)}`;
    const iconKey = clean(record.iconKey) || inferIconKey(categoryNormalized);

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        id: categoryId,
        name: categoryName,
        normalizedName: categoryNormalized,
        iconKey,
        source,
        sourceCategoryId,
      });
    }

    products.set(productId, {
      id: productId,
      name,
      normalizedName: normalizedName(name),
      categoryId,
      iconKey,
      brand: cleanDisplayText(record.brand),
      packageSize: cleanDisplayText(record.packageSize),
      source,
      sourceProductId,
    });

    for (const alias of record.aliases ?? []) {
      const cleanedAlias = cleanDisplayText(alias);
      if (!cleanedAlias) continue;
      const aliasId = `alias-${productId}-${slug(cleanedAlias)}`;
      aliases.set(aliasId, { id: aliasId, productId, alias: cleanedAlias, normalizedAlias: normalizedName(cleanedAlias) });
    }
  }

  return {
    categories: [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    products: [...products.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    aliases: [...aliases.values()].sort((a, b) => a.alias.localeCompare(b.alias, 'es')),
  };
}

export function catalogRecordsFromJson(payload: unknown, options: ImportJsonOptions): CatalogImportInput[] {
  const candidates = extractObjects(payload);
  const records: CatalogImportInput[] = [];
  for (const candidate of candidates) {
    const name = firstText(candidate, ['name', 'display_name', 'displayName']);
    const category = firstText(candidate, ['category', 'category_name', 'categoryName']) ?? categoryFromNested(candidate) ?? options.fallbackCategory;
    if (!name || !category) continue;
    records.push({
      name,
      category,
      brand: brandFrom(candidate),
      packageSize: firstText(candidate, ['packageSize', 'package_size', 'packaging']) ?? priceInstructionText(candidate, 'unit_size') ?? priceInstructionText(candidate, 'bulk_price') ?? null,
      source: firstText(candidate, ['source']) ?? options.defaultSource,
      sourceProductId: firstText(candidate, ['sourceProductId', 'source_product_id', 'id']) ?? null,
      sourceCategoryId: firstText(candidate, ['sourceCategoryId', 'source_category_id', 'categoryId', 'category_id']) ?? null,
      aliases: aliasesFrom(candidate),
    });
  }
  return records;
}

export function buildCatalogImportSql(catalog: NormalizedCatalogImport, options: { transaction?: boolean } = {}): string {
  const now = new Date().toISOString();
  const useTransaction = options.transaction ?? true;
  const statements: string[] = useTransaction ? ['BEGIN TRANSACTION;'] : [];

  for (const category of catalog.categories) {
    statements.push(`INSERT INTO product_categories (id, name, normalized_name, icon_key, source, source_category_id, created_at, updated_at) VALUES (${values([category.id, category.name, category.normalizedName, category.iconKey, category.source, category.sourceCategoryId, now, now])}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, icon_key = excluded.icon_key, source = excluded.source, source_category_id = excluded.source_category_id, updated_at = excluded.updated_at;`);
  }

  for (const product of catalog.products) {
    statements.push(`INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, brand, package_size, source, source_product_id, is_active, created_at, updated_at) VALUES (${values([product.id, product.name, product.normalizedName, product.categoryId, product.iconKey, product.brand, product.packageSize, product.source, product.sourceProductId, 1, now, now])}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, category_id = excluded.category_id, icon_key = excluded.icon_key, brand = excluded.brand, package_size = excluded.package_size, source = excluded.source, source_product_id = excluded.source_product_id, is_active = excluded.is_active, updated_at = excluded.updated_at;`);
  }

  for (const alias of catalog.aliases) {
    statements.push(`INSERT INTO product_aliases (id, product_id, alias, normalized_alias, created_at) VALUES (${values([alias.id, alias.productId, alias.alias, alias.normalizedAlias, now])}) ON CONFLICT(id) DO NOTHING;`);
  }

  if (useTransaction) statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function cleanDisplayText(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  return stripAccents(repairMojibake(text)).replace(/\s+/g, ' ').trim();
}

function repairMojibake(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/Ã¡/g, 'á'], [/Ã©/g, 'é'], [/Ã­/g, 'í'], [/Ã³/g, 'ó'], [/Ãº/g, 'ú'],
    [/ÃÁ/g, 'Á'], [/Ã‰/g, 'É'], [/Ã/g, 'Í'], [/Ã“/g, 'Ó'], [/Ãš/g, 'Ú'],
    [/Ã±/g, 'ñ'], [/Ã‘/g, 'Ñ'], [/Ã¼/g, 'ü'], [/Ãœ/g, 'Ü'],
    [/Âº/g, 'º'], [/Âª/g, 'ª'], [/Â·/g, '·'], [/Â/g, ''],
  ];
  return replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractObjects(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload)) {
    for (const key of ['results', 'products', 'items', 'data']) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter(isRecord);
    }
    return [payload];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = clean(record[key]);
    if (value) return value;
    if (typeof record[key] === 'number') return String(record[key]);
  }
  return null;
}

function categoryFromNested(record: Record<string, unknown>): string | null {
  const categories = record.categories;
  if (Array.isArray(categories)) {
    const found = categories.find(isRecord);
    if (found) return firstText(found, ['name', 'display_name', 'displayName']);
  }
  const category = record.category;
  if (isRecord(category)) return firstText(category, ['name', 'display_name', 'displayName']);
  return null;
}

function brandFrom(record: Record<string, unknown>): string | null {
  const brand = record.brand;
  if (isRecord(brand)) return firstText(brand, ['name', 'display_name', 'displayName']);
  return clean(brand);
}

function aliasesFrom(record: Record<string, unknown>): string[] {
  return Array.isArray(record.aliases) ? record.aliases.map(clean).filter((alias): alias is string => alias !== null) : [];
}

function categoryIdFrom(categoryName: string, source: string): string {
  return `${slug(source)}-${slug(categoryName)}`;
}

function priceInstructionText(record: Record<string, unknown>, key: string): string | null {
  return isRecord(record.price_instructions) ? clean(record.price_instructions[key]) : null;
}

function slug(value: string): string {
  const normalized = normalizedName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

function inferIconKey(categoryNormalizedName: string): string {
  if (categoryNormalizedName.includes('lacteo') || categoryNormalizedName.includes('leche')) return 'milk';
  if (categoryNormalizedName.includes('pan')) return 'bread';
  if (categoryNormalizedName.includes('fruta')) return 'apple';
  if (categoryNormalizedName.includes('verdura')) return 'carrot';
  if (categoryNormalizedName.includes('carne')) return 'meat';
  if (categoryNormalizedName.includes('pescado')) return 'fish';
  if (categoryNormalizedName.includes('bebida')) return 'bottle';
  return 'shopping-basket';
}

function values(items: Array<string | number | null>): string {
  return items.map(sqlValue).join(', ');
}

function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}
