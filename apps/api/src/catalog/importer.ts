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
    const rawCategoryName = cleanDisplayText(record.category);
    if (!name || !rawCategoryName) continue;
    const categoryName = canonicalCategoryName(name, rawCategoryName);
    const source = clean(record.source) || options.defaultSource;
    const sourceProductId = clean(record.sourceProductId) || slug(name);
    const sourceCategoryId = clean(record.sourceCategoryId) || categoryIdFrom(categoryName, source);
    const categoryNormalized = normalizedName(categoryName);
    const categoryId = `cat-${slug(categoryName)}`;
    const productId = `prod-${slug(source)}-${slug(sourceProductId)}`;
    const iconKey = clean(record.iconKey) || inferIconKey(normalizedName(name), categoryNormalized);

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        id: categoryId,
        name: categoryName,
        normalizedName: categoryNormalized,
        iconKey: inferCategoryIconKey(categoryNormalized),
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

function canonicalCategoryName(productName: string, categoryName: string): string {
  const product = normalizedName(productName);
  const category = normalizedName(categoryName);
  if (category === 'panaderia') return 'Panaderia y pasteleria';
  if (category === 'arroz, pasta y legumbres') return 'Arroz, legumbres y pasta';
  if (category === 'cafe, cacao e infusiones') return 'Cacao, cafe e infusiones';
  if (category === 'conservas y platos preparados') return 'Conservas, caldos y cremas';
  if (category === 'drogueria y limpieza') return 'Limpieza y hogar';
  if (category === 'perfumeria e higiene') return product.includes('champu') ? 'Cuidado del cabello' : 'Cuidado facial y corporal';
  if (category === 'pescado') return 'Marisco y pescado';
  if (category === 'bebidas') return 'Agua y refrescos';
  if (category === 'huevos') return 'Huevos, leche y mantequilla';
  if (category === 'fruta' || category === 'verdura') return 'Fruta y verdura';
  if (category === 'lacteos') {
    if (product.includes('queso')) return 'Charcuteria y quesos';
    if (product.includes('yogur')) return 'Postres y yogures';
    return 'Huevos, leche y mantequilla';
  }
  return categoryName;
}

function inferIconKey(productNormalizedName: string, categoryNormalizedName: string): string {
  const text = `${productNormalizedName} ${categoryNormalizedName}`;
  if (productNormalizedName.includes('panal') || productNormalizedName.includes('panales')) return 'diaper';
  if (productNormalizedName.includes('refresco') || productNormalizedName.includes('gaseosa') || productNormalizedName.includes('coca-cola') || productNormalizedName.includes('cola ')) return 'soft-drink';
  if (productNormalizedName.includes('agua mineral') || productNormalizedName.includes('agua con gas') || productNormalizedName.includes('agua de soda') || productNormalizedName.includes('agua de coco') || productNormalizedName.includes('agua destilada')) return 'water';
  if (productNormalizedName.includes('zumo') || productNormalizedName.includes('jugo')) return 'juice';
  if (productNormalizedName.includes('vino')) return 'wine';
  if (productNormalizedName.includes('cerveza')) return 'beer';
  if (hasWord(productNormalizedName, 'cafe') || productNormalizedName.includes('capuccino') || productNormalizedName.includes('cappuccino')) return 'coffee';
  if (productNormalizedName.includes('bebida')) return 'drink';
  if (productNormalizedName.includes('acondicionador') || productNormalizedName.includes('pantene') || productNormalizedName.includes('cabello') || productNormalizedName.includes('capilar')) return 'hair-care';
  if (text.includes('arroz')) return 'rice';
  if (text.includes('pasta') || text.includes('macarron') || text.includes('espagueti') || text.includes('tallar')) return 'pasta';
  if (text.includes('alubia') || text.includes('judia') || text.includes('garbanzo') || text.includes('lenteja') || text.includes('legumbre')) return 'beans';
  if (text.includes('cacao') || text.includes('chocolate') || text.includes('bombon')) return 'chocolate';
  if (text.includes('salsa') || text.includes('mayonesa') || text.includes('mostaza') || text.includes('ketchup')) return 'sauce';
  if (text.includes('atun') || text.includes('pescado') || text.includes('marisco')) return 'fish';
  if (text.includes('aceite') || text.includes('oliva') || text.includes('aceituna')) return 'oil';
  if (text.includes('huevo')) return 'egg';
  if (text.includes('queso')) return 'cheese';
  if (text.includes('mantequilla')) return 'butter';
  if (text.includes('harina')) return 'flour';
  if (hasWord(text, 'sal') || text.includes('especia') || text.includes('pimienta')) return 'salt';
  if (text.includes('galleta') || text.includes('cereal')) return 'cookie';
  if (text.includes('azucar') || text.includes('caramelo') || text.includes('dulce')) return 'candy';
  if (text.includes('postre') || text.includes('flan') || text.includes('natilla')) return 'dessert';
  if (text.includes('helado') || text.includes('congelado')) return 'frozen';
  if (text.includes('pizza')) return 'pizza';
  if (text.includes('sopa') || text.includes('caldo') || text.includes('crema')) return 'soup';
  if (hasWord(text, 'pan') || text.includes('panaderia') || text.includes('panecillo') || text.includes('baguette') || text.includes('bolleria') || text.includes('bocadillo') || text.includes('croissant') || text.includes('ensaimada') || text.includes('napolitana') || text.includes('bizcocho') || text.includes('magdalena') || text.includes('tostada') || text.includes('mollete') || text.includes('hogaza') || text.includes('rosquilla') || text.includes('palmera') || text.includes('grissini')) return 'bread';
  if (text.includes('leche') || text.includes('lacteo') || text.includes('yogur')) return 'milk';
  if (text.includes('tomate')) return 'tomato';
  if (text.includes('patata') || text.includes('papa')) return 'potato';
  if (text.includes('cebolla')) return 'onion';
  if (text.includes('ajo')) return 'garlic';
  if (text.includes('platano') || text.includes('banana')) return 'banana';
  if (text.includes('naranja') || text.includes('mandarina')) return 'orange';
  if (text.includes('limon')) return 'lemon';
  if (text.includes('fruta') || text.includes('manzana')) return 'apple';
  if (text.includes('verdura') || text.includes('zanahoria')) return 'carrot';
  if (text.includes('carne') || text.includes('pollo')) return 'meat';
  if (text.includes('salchicha') || text.includes('chorizo') || text.includes('jamon') || text.includes('charcuteria')) return 'cold-cuts';
  if (text.includes('zumo') || text.includes('jugo')) return 'juice';
  if (text.includes('vino') || text.includes('bodega')) return 'wine';
  if (text.includes('cerveza')) return 'beer';
  if (text.includes('refresco') || text.includes('gaseosa') || productNormalizedName.includes('coca-cola') || productNormalizedName.includes('cola ')) return 'soft-drink';
  if (productNormalizedName.includes('agua mineral') || productNormalizedName.includes('agua con gas') || productNormalizedName.includes('agua de soda') || productNormalizedName.includes('agua de coco') || productNormalizedName.includes('agua destilada') || categoryNormalizedName.includes('agua')) return 'water';
  if (categoryNormalizedName.includes('cafe') || categoryNormalizedName.includes('infusion') || hasWord(productNormalizedName, 'cafe') || productNormalizedName.includes('capuccino') || productNormalizedName.includes('cappuccino')) return 'coffee';
  if (text.includes('bebida')) return 'drink';
  if (text.includes('snack') || text.includes('aperitivo') || text.includes('patatas fritas')) return 'snack';
  if (text.includes('papel') || text.includes('servilleta') || text.includes('panuelo')) return 'paper';
  if (text.includes('detergente') || text.includes('lavavajillas')) return 'detergent';
  if (text.includes('limpieza') || text.includes('drogueria')) return 'cleaning';
  if (text.includes('panal') || text.includes('panales')) return 'diaper';
  if (text.includes('acondicionador') || text.includes('pantene') || text.includes('cabello') || text.includes('capilar')) return 'hair-care';
  if (text.includes('higiene') || text.includes('gel') || text.includes('champu') || text.includes('jabon') || text.includes('cuidado')) return 'hygiene';
  if (text.includes('maquillaje')) return 'makeup';
  if (text.includes('preservativo')) return 'condom';
  if (text.includes('lagrima') || text.includes('lente de contacto') || text.includes('ojos')) return 'eye-care';
  if (text.includes('mosquito') || text.includes('citronela') || text.includes('repelente') || text.includes('picor')) return 'repellent';
  if (text.includes('alcohol') || text.includes('antiseptico') || text.includes('desinfectante') || text.includes('clorhexidina') || text.includes('povidona')) return 'antiseptic';
  if (text.includes('tirita') || text.includes('tira adhesiva') || text.includes('aposito') || text.includes('esparadrapo') || text.includes('venda') || text.includes('gasa')) return 'bandage';
  if (text.includes('algodon') || text.includes('bastoncillo')) return 'cotton';
  if (text.includes('capsula') || text.includes('comprimido') || text.includes('vitamina') || text.includes('mineral') || text.includes('probiotico') || text.includes('omega') || text.includes('melatonina') || text.includes('creatina') || text.includes('jalea real') || text.includes('propolis') || text.includes('valeriana') || text.includes('colagen')) return 'supplement';
  if (text.includes('vaselina') || text.includes('arnica') || text.includes('balsamo') || text.includes('parafarmacia') || text.includes('fitoterapia')) return 'first-aid';
  if (text.includes('mascota') || text.includes('perro') || text.includes('gato')) return 'pet';
  if (text.includes('bebe')) return 'baby';
  if (text.includes('conserva')) return 'can';
  return 'shopping-basket';
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);
}

function inferCategoryIconKey(categoryNormalizedName: string): string {
  if (categoryNormalizedName.includes('cafe') || categoryNormalizedName.includes('infusion')) return 'coffee';
  if (categoryNormalizedName.includes('agua')) return 'water';
  if (categoryNormalizedName.includes('refresco')) return 'soft-drink';
  if (categoryNormalizedName.includes('bebida')) return 'drink';
  return inferIconKey('', categoryNormalizedName);
}

function values(items: Array<string | number | null>): string {
  return items.map(sqlValue).join(', ');
}

function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}
