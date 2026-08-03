import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { cleanDisplayText } from '../src/catalog/importer.ts';
import type { CatalogImportInput } from '../src/catalog/importer.ts';

interface MercadonaProductIds {
  product_ids: string[];
}

interface MercadonaCategoryRoot {
  results: Array<{
    id: number;
    name: string;
    categories?: Array<{ id: number; name: string }>;
  }>;
}

interface MercadonaProduct {
  id: string;
  display_name?: string;
  name?: string;
  brand?: string | null;
  packaging?: string | null;
  categories?: Array<{ id: number; name: string }>;
  price_instructions?: {
    unit_size?: string | number | null;
    size_format?: string | null;
    reference_format?: string | null;
  };
  details?: {
    legal_name?: string | null;
    brand?: string | null;
  };
}

const DATASET_BASE_URL = 'https://huggingface.co/datasets/datania/mercadona-catalog/resolve/main';
const args = process.argv.slice(2);
const datasetDirArgIndex = args.indexOf('--dataset-dir');
const datasetDir = datasetDirArgIndex >= 0 ? args[datasetDirArgIndex + 1] : null;
const positional = datasetDirArgIndex >= 0
  ? args.filter((arg, index) => index !== datasetDirArgIndex && index !== datasetDirArgIndex + 1)
  : args;
const outputPath = positional[0] ?? 'catalog/mercadona.seed.json';

const categoriesRoot = await loadJson<MercadonaCategoryRoot>('categories.json');
const productIds = await loadJson<MercadonaProductIds>('product_ids.json');
const categoryNames = new Map<number, string>();

for (const category of categoriesRoot.results) {
  categoryNames.set(category.id, category.name);
  for (const child of category.categories ?? []) {
    categoryNames.set(child.id, category.name);
  }
}

const products = await fetchProducts(productIds.product_ids);
const records: CatalogImportInput[] = products
  .map((product): CatalogImportInput | null => {
    const name = product.display_name ?? product.name;
    const rootCategory = product.categories?.[0];
    const category = rootCategory ? categoryNames.get(rootCategory.id) ?? rootCategory.name : null;
    if (!name || !category) return null;

    const legalName = product.details?.legal_name;
    const aliases = legalName && legalName !== name ? [legalName] : [];
    return {
      name: cleanDisplayText(name) ?? name,
      category: cleanDisplayText(category) ?? category,
      brand: cleanDisplayText(product.brand ?? product.details?.brand ?? null),
      packageSize: cleanDisplayText(packageSizeFrom(product)),
      source: 'mercadona',
      sourceProductId: product.id,
      sourceCategoryId: rootCategory ? String(rootCategory.id) : null,
      aliases: aliases.map((alias) => cleanDisplayText(alias)).filter((alias): alias is string => alias !== null),
    };
  })
  .filter((record): record is CatalogImportInput => record !== null)
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

console.log(`Catalogo Mercadona generado: ${outputPath}`);
console.log(`Productos fuente: ${productIds.product_ids.length}`);
console.log(`Productos importables: ${records.length}`);

async function fetchProducts(ids: string[]): Promise<MercadonaProduct[]> {
  const concurrency = 4;
  const results: MercadonaProduct[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      const product = await loadJson<MercadonaProduct>(`products/${id}.json`);
      results.push(product);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function loadJson<T>(relativePath: string): Promise<T> {
  if (datasetDir) {
    return JSON.parse(await readFile(join(datasetDir, relativePath), 'utf8')) as T;
  }
  return fetchJson<T>(`${DATASET_BASE_URL}/${relativePath}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'NFCompra catalog importer' } });
    if (response.ok) return await response.json() as T;
    if (response.status !== 429 || attempt === 6) {
      throw new Error(`No se pudo descargar ${url}: ${response.status}`);
    }
    await delay(1000 * attempt);
  }
  throw new Error(`No se pudo descargar ${url}`);
}

function packageSizeFrom(product: MercadonaProduct): string | null {
  if (product.packaging?.trim()) return product.packaging.trim();
  const unitSize = product.price_instructions?.unit_size;
  if (unitSize === null || unitSize === undefined || unitSize === '') return null;
  const format = product.price_instructions?.size_format ?? product.price_instructions?.reference_format ?? '';
  return `${unitSize}${format ? ` ${format}` : ''}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
