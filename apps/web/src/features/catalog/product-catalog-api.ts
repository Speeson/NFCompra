import { ApiError } from '../../api/client';
import { apiClient } from '../../api/session';

export type CatalogScope = 'system' | 'household';

export interface CatalogPermissions {
  canEdit: boolean;
  canDelete: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  normalizedName: string;
  parentId: string | null;
  iconKey: string;
  source: string | null;
  sourceCategoryId: string | null;
  scope?: CatalogScope;
  householdId?: string | null;
  permissions?: CatalogPermissions;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
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
  scope?: CatalogScope;
  householdId?: string | null;
  permissions?: CatalogPermissions;
  isFavorite?: boolean;
}

export interface ProductCategoryInput {
  name: string;
  iconKey?: string | null;
  parentId?: string | null;
}

export interface ProductCatalogInput {
  name: string;
  categoryId?: string | null;
  iconKey?: string | null;
  brand?: string | null;
  packageSize?: string | null;
}

interface ProductCatalogSnapshot {
  version: string;
  productCount: number;
  products: ProductCatalogItem[];
}

const snapshotPromises = new Map<string, Promise<ProductCatalogSnapshot> | null>();
const snapshotCaches = new Map<string, ProductCatalogSnapshot | null>();

export async function fetchProductCategories(householdId?: string): Promise<ProductCategory[]> {
  const response = await apiClient.request<{ categories: ProductCategory[] }>(catalogPath('/product-categories', householdId));
  return response.categories;
}

export async function loadProductCatalogSnapshot(householdId?: string): Promise<ProductCatalogItem[]> {
  const snapshot = await loadSnapshot(householdId);
  return snapshot.products;
}

export async function setProductFavorite(productId: string, favorite: boolean): Promise<{ productId: string; isFavorite: boolean }> {
  return apiClient.request<{ productId: string; isFavorite: boolean }>(`/product-catalog/${encodeURIComponent(productId)}/favorite`, {
    method: favorite ? 'POST' : 'DELETE',
  });
}

export async function createProductCategory(input: ProductCategoryInput): Promise<ProductCategory> {
  const response = await apiClient.request<{ category: ProductCategory }>('/product-categories', {
    method: 'POST',
    body: input,
  });
  clearProductCatalogCache();
  return response.category;
}

export async function updateProductCategory(categoryId: string, input: Partial<ProductCategoryInput>): Promise<ProductCategory> {
  const response = await apiClient.request<{ category: ProductCategory }>(`/product-categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    body: input,
  });
  clearProductCatalogCache();
  return response.category;
}

export async function deleteProductCategory(categoryId: string): Promise<void> {
  await apiClient.request<{ status: string }>(`/product-categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
  clearProductCatalogCache();
}

export async function createProductCatalogItem(input: ProductCatalogInput): Promise<ProductCatalogItem> {
  const response = await apiClient.request<{ product: ProductCatalogItem }>('/product-catalog', {
    method: 'POST',
    body: input,
  });
  clearProductCatalogCache();
  return response.product;
}

export async function updateProductCatalogItem(productId: string, input: Partial<ProductCatalogInput>): Promise<ProductCatalogItem> {
  const response = await apiClient.request<{ product: ProductCatalogItem }>(`/product-catalog/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: input,
  });
  clearProductCatalogCache();
  return response.product;
}

export async function deleteProductCatalogItem(productId: string): Promise<void> {
  await apiClient.request<{ status: string }>(`/product-catalog/${encodeURIComponent(productId)}`, { method: 'DELETE' });
  clearProductCatalogCache();
}

export async function createHouseholdProductCategory(householdId: string, input: ProductCategoryInput): Promise<ProductCategory> {
  const response = await apiClient.request<{ category: ProductCategory }>(`/households/${encodeURIComponent(householdId)}/product-categories`, {
    method: 'POST',
    body: input,
  });
  clearProductCatalogCache();
  return response.category;
}

export async function updateHouseholdProductCategory(householdId: string, categoryId: string, input: Partial<ProductCategoryInput>): Promise<ProductCategory> {
  const response = await apiClient.request<{ category: ProductCategory }>(`/households/${encodeURIComponent(householdId)}/product-categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    body: input,
  });
  clearProductCatalogCache();
  return response.category;
}

export async function deleteHouseholdProductCategory(householdId: string, categoryId: string): Promise<void> {
  await apiClient.request<{ status: string }>(`/households/${encodeURIComponent(householdId)}/product-categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' });
  clearProductCatalogCache();
}

export async function createHouseholdProductCatalogItem(householdId: string, input: ProductCatalogInput): Promise<ProductCatalogItem> {
  const response = await apiClient.request<{ product: ProductCatalogItem }>(`/households/${encodeURIComponent(householdId)}/product-catalog`, {
    method: 'POST',
    body: input,
  });
  clearProductCatalogCache();
  return response.product;
}

export async function updateHouseholdProductCatalogItem(householdId: string, productId: string, input: Partial<ProductCatalogInput>): Promise<ProductCatalogItem> {
  const response = await apiClient.request<{ product: ProductCatalogItem }>(`/households/${encodeURIComponent(householdId)}/product-catalog/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: input,
  });
  clearProductCatalogCache();
  return response.product;
}

export async function deleteHouseholdProductCatalogItem(householdId: string, productId: string): Promise<void> {
  await apiClient.request<{ status: string }>(`/households/${encodeURIComponent(householdId)}/product-catalog/${encodeURIComponent(productId)}`, { method: 'DELETE' });
  clearProductCatalogCache();
}

export async function searchProductCatalog(search: string, limit = 10, householdId?: string): Promise<ProductCatalogItem[]> {
  const query = normalized(search);
  if (query.length < 3) return [];
  try {
    const snapshot = await loadSnapshot(householdId);
    return searchSnapshot(snapshot.products, query, limit);
  } catch {
    const params = new URLSearchParams({ search, limit: String(limit) });
    if (householdId) params.set('householdId', householdId);
    const response = await requestCatalogSearch(`/product-catalog?${params.toString()}`);
    return response.products;
  }
}

export function clearProductCatalogCacheForTests(): void {
  clearProductCatalogCache();
}

function clearProductCatalogCache(): void {
  snapshotPromises.clear();
  snapshotCaches.clear();
}

function catalogPath(path: string, householdId?: string): string {
  if (!householdId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}householdId=${encodeURIComponent(householdId)}`;
}

function snapshotKey(householdId?: string): string {
  return householdId ?? '';
}

async function loadSnapshot(householdId?: string): Promise<ProductCatalogSnapshot> {
  const key = snapshotKey(householdId);
  const cached = snapshotCaches.get(key);
  if (cached) return cached;
  const pending = snapshotPromises.get(key);
  if (!pending) {
    snapshotPromises.set(key, requestSnapshot(catalogPath('/product-catalog/snapshot', householdId))
      .then((snapshot) => {
        snapshotCaches.set(key, snapshot);
        return snapshot;
      })
      .catch((error) => {
        snapshotPromises.delete(key);
        throw error;
      }));
  }
  return snapshotPromises.get(key)!;
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
    .sort((a, b) => {
      const tierDiff = catalogSearchTier(a.product) - catalogSearchTier(b.product);
      if (tierDiff !== 0) return tierDiff;
      return a.rank === b.rank ? a.product.name.localeCompare(b.product.name, 'es') : a.rank - b.rank;
    })
    .slice(0, safeLimit)
    .map(({ product }) => product);
  return matches;
}

function catalogSearchTier(product: ProductCatalogItem): number {
  if (product.isFavorite) return 0;
  if (product.scope === 'household') return 1;
  return 2;
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
