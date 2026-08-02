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
  const response = await apiClient.request<{ products: ProductCatalogItem[] }>(`/product-catalog?${params.toString()}`);
  return response.products;
}
