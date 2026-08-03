import { ApiError } from '../../api/client';
import { apiClient } from '../../api/session';

export interface ProductCategory {
  id: string;
  name: string;
  normalizedName: string;
  parentId: string | null;
  iconKey: string;
  source: string | null;
  sourceCategoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string | null;
  categoryName: string | null;
  iconKey: string;
  brand: string | null;
  packageSize: string | null;
  source: string | null;
  sourceProductId: string | null;
}

interface ProductCatalogSnapshot {
  version: string;
  productCount: number;
  products: ProductCatalogItem[];
}

let snapshotPromise: Promise<ProductCatalogSnapshot> | null = null;
let snapshotCache: ProductCatalogSnapshot | null = null;

export async function fetchProductCategories(): Promise<ProductCategory[]> {
  const response = await apiClient.request<{ categories: ProductCategory[] }>('/product-categories');
  return response.categories;
}

export async function loadProductCatalogSnapshot(): Promise<ProductCatalogItem[]> {
  const snapshot = await loadSnapshot();
  return snapshot.products;
}

export async function searchProductCatalog(search: string, limit = 10): Promise<ProductCatalogItem[]> {
  const query = normalized(search);
  if (query.length < 2) return [];
  try {
    const snapshot = await loadSnapshot();
    return searchSnapshot(snapshot.products, query, limit);
  } catch {
    const params = new URLSearchParams({ search, limit: String(limit) });
    const response = await requestCatalogSearch(`/product-catalog?${params.toString()}`);
    return response.products;
  }
}

export function clearProductCatalogCacheForTests(): void {
  snapshotPromise = null;
  snapshotCache = null;
}

async function loadSnapshot(): Promise<ProductCatalogSnapshot> {
  if (snapshotCache) return snapshotCache;
  snapshotPromise ??= requestSnapshot('/product-catalog/snapshot')
    .then((snapshot) => {
      snapshotCache = snapshot;
      return snapshot;
    })
    .catch((error) => {
      snapshotPromise = null;
      throw error;
    });
  return snapshotPromise;
}

async function requestSnapshot(path: string): Promise<ProductCatalogSnapshot> {
  try {
    const response = await apiClient.request<ProductCatalogSnapshot>(path, { retryOnUnauthorized: false });
    if (!Array.isArray(response.products)) throw new Error('Catalog snapshot payload invalid');
    return response;
  } catch (cause) {
    if (cause instanceof ApiError && cause.status !== 404) throw cause;
    return directSnapshotRequest(path);
  }
}

async function requestCatalogSearch(path: string): Promise<{ products: ProductCatalogItem[] }> {
  try {
    return await apiClient.request<{ products: ProductCatalogItem[] }>(path, { retryOnUnauthorized: false });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status !== 404) throw cause;
    return directCatalogRequest(path);
  }
}

async function directSnapshotRequest(path: string): Promise<ProductCatalogSnapshot> {
  const response = await fetch(`https://api.nfcompra.esgarpe.dev/v1${path}`, { credentials: 'omit' });
  const body = await response.json() as Partial<ProductCatalogSnapshot>;
  if (!response.ok || !Array.isArray(body.products) || typeof body.version !== 'string') {
    throw new Error('Catalog snapshot unavailable');
  }
  return {
    version: body.version,
    productCount: typeof body.productCount === 'number' ? body.productCount : body.products.length,
    products: body.products,
  };
}

async function directCatalogRequest(path: string): Promise<{ products: ProductCatalogItem[] }> {
  const response = await fetch(`https://api.nfcompra.esgarpe.dev/v1${path}`, { credentials: 'omit' });
  const body = await response.json() as { products?: ProductCatalogItem[] };
  if (!response.ok || !Array.isArray(body.products)) return { products: [] };
  return { products: body.products };
}

function searchSnapshot(products: ProductCatalogItem[], query: string, limit: number): ProductCatalogItem[] {
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const matches = products
    .map((product) => ({ product, rank: productRank(product, query) }))
    .filter((entry): entry is { product: ProductCatalogItem; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank === b.rank ? a.product.name.localeCompare(b.product.name, 'es') : a.rank - b.rank)
    .slice(0, safeLimit)
    .map(({ product }) => product);
  return matches;
}

function productRank(product: ProductCatalogItem, query: string): number | null {
  const name = product.normalizedName || normalized(product.name);
  if (name.startsWith(query)) return 0;
  if (name.split(' ').some((word) => word.startsWith(query))) return 1;
  if (name.includes(query)) return 2;
  const category = normalized(product.categoryName ?? '');
  if (category.includes(query)) return 3;
  return null;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
