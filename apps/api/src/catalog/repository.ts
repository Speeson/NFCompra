import type { Env } from '../env';
import { normalizedName } from '../lists/validation.ts';

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

interface CategoryRow {
  id: string;
  name: string;
  normalized_name: string;
  parent_id: string | null;
  icon_key: string;
  source: string | null;
  source_category_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  normalized_name: string;
  category_id: string | null;
  category_name: string | null;
  icon_key: string;
  brand: string | null;
  package_size: string | null;
  source: string | null;
  source_product_id: string | null;
}

export async function listProductCategories(env: Env): Promise<ProductCategory[]> {
  const { results } = await env.DB.prepare('SELECT * FROM product_categories ORDER BY name ASC').all<CategoryRow>();
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    parentId: row.parent_id,
    iconKey: row.icon_key,
    source: row.source,
    sourceCategoryId: row.source_category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function searchProductCatalog(env: Env, search: string, limit: number): Promise<ProductCatalogItem[]> {
  const normalizedSearch = `%${normalizedName(search)}%`;
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const { results } = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    WHERE product_catalog.is_active = 1
      AND (
        product_catalog.normalized_name LIKE ?
        OR EXISTS (
          SELECT 1 FROM product_aliases
          WHERE product_aliases.product_id = product_catalog.id
            AND product_aliases.normalized_alias LIKE ?
        )
      )
    ORDER BY product_catalog.name ASC
    LIMIT ?
  `).bind(normalizedSearch, normalizedSearch, safeLimit).all<ProductRow>();

  return results.map((row) => ({
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    iconKey: row.icon_key,
    brand: row.brand,
    packageSize: row.package_size,
    source: row.source,
    sourceProductId: row.source_product_id,
  }));
}
