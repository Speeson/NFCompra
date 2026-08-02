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

export async function fetchProductCategories(): Promise<ProductCategory[]> {
  const response = await apiClient.request<{ categories: ProductCategory[] }>('/product-categories');
  return response.categories;
}

export async function searchProductCatalog(search: string, limit = 10): Promise<ProductCatalogItem[]> {
  const params = new URLSearchParams({ search, limit: String(limit) });
  const path = `/product-catalog?${params.toString()}`;
  const response = await requestCatalog(path);
  return response.products;
}

async function requestCatalog(path: string): Promise<{ products: ProductCatalogItem[] }> {
  try {
    return await apiClient.request<{ products: ProductCatalogItem[] }>(path, { retryOnUnauthorized: false });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status !== 404) throw cause;
    return directCatalogRequest(path);
  }
}

async function directCatalogRequest(path: string): Promise<{ products: ProductCatalogItem[] }> {
  const response = await fetch(`https://api.nfcompra.esgarpe.dev/v1${path}`, { credentials: 'omit' });
  const body = await response.json() as { products?: ProductCatalogItem[] };
  if (!response.ok || !Array.isArray(body.products)) return { products: [] };
  return { products: body.products };
}
