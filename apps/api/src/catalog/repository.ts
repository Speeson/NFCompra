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
  isFavorite: boolean;
}

export interface ProductCategoryInput {
  name: string;
  parentId?: string | null;
  iconKey?: string | null;
}

export interface ProductCatalogInput {
  name: string;
  categoryId?: string | null;
  iconKey?: string | null;
  brand?: string | null;
  packageSize?: string | null;
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
  is_favorite?: number | null;
}

interface CatalogVersionRow {
  version: string | null;
  product_count: number;
}

export async function listProductCategories(env: Env, userId?: string): Promise<ProductCategory[]> {
  const { results } = await env.DB.prepare('SELECT * FROM product_categories ORDER BY name ASC').all<CategoryRow>();
  const categories = results.map((row) => ({
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
  if (!userId) return categories;
  return [
    {
      id: 'favorites',
      name: 'Favoritos',
      normalizedName: 'favoritos',
      parentId: null,
      iconKey: 'star',
      source: 'user',
      sourceCategoryId: null,
      createdAt: '',
      updatedAt: '',
      isFavorite: true,
    },
    ...categories,
  ];
}

export async function getProductCatalogVersion(env: Env): Promise<{ version: string; productCount: number }> {
  const row = await env.DB.prepare(`
    SELECT MAX(updated_at) AS version, COUNT(*) AS product_count
    FROM product_catalog
    WHERE is_active = 1
  `).first<CatalogVersionRow>();
  return {
    version: row?.version ?? 'empty',
    productCount: row?.product_count ?? 0,
  };
}

export async function createProductCategory(env: Env, input: ProductCategoryInput): Promise<ProductCategory | null> {
  const duplicate = await env.DB.prepare('SELECT id FROM product_categories WHERE normalized_name = ?').bind(normalizedName(input.name)).first<{ id: string }>();
  if (duplicate) return null;
  if (input.parentId) {
    const parent = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ?').bind(input.parentId).first<{ id: string }>();
    if (!parent) throw new Error('CATEGORY_PARENT_NOT_FOUND');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO product_categories (id, name, normalized_name, parent_id, icon_key, source, source_category_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'user', NULL, ?, ?)
  `).bind(id, input.name, normalizedName(input.name), input.parentId ?? null, input.iconKey ?? 'shopping-basket', now, now).run();
  return getProductCategory(env, id);
}

export async function updateProductCategory(env: Env, categoryId: string, input: Partial<ProductCategoryInput>): Promise<ProductCategory | null> {
  const current = await env.DB.prepare('SELECT id, name, parent_id, icon_key FROM product_categories WHERE id = ?').bind(categoryId).first<{ id: string; name: string; parent_id: string | null; icon_key: string }>();
  if (!current) return null;
  const name = input.name ?? current.name;
  const parentId = input.parentId === undefined ? current.parent_id : input.parentId;
  if (parentId) {
    if (parentId === categoryId) throw new Error('CATEGORY_PARENT_INVALID');
    const parent = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ?').bind(parentId).first<{ id: string }>();
    if (!parent) throw new Error('CATEGORY_PARENT_NOT_FOUND');
  }
  const duplicate = await env.DB.prepare('SELECT id FROM product_categories WHERE normalized_name = ? AND id <> ?').bind(normalizedName(name), categoryId).first<{ id: string }>();
  if (duplicate) throw new Error('CATEGORY_DUPLICATE');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE product_categories
      SET name = ?, normalized_name = ?, parent_id = ?, icon_key = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, normalizedName(name), parentId ?? null, input.iconKey ?? current.icon_key, now, categoryId),
    env.DB.prepare('UPDATE product_catalog SET updated_at = ? WHERE category_id = ? AND is_active = 1').bind(now, categoryId),
  ]);
  return getProductCategory(env, categoryId);
}

export async function deleteProductCategory(env: Env, categoryId: string): Promise<boolean> {
  const current = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ?').bind(categoryId).first<{ id: string }>();
  if (!current) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE product_catalog SET category_id = NULL, updated_at = ? WHERE category_id = ?').bind(new Date().toISOString(), categoryId),
    env.DB.prepare('UPDATE product_categories SET parent_id = NULL, updated_at = ? WHERE parent_id = ?').bind(new Date().toISOString(), categoryId),
    env.DB.prepare('DELETE FROM product_categories WHERE id = ?').bind(categoryId),
  ]);
  return true;
}

export async function createProductCatalogItem(env: Env, input: ProductCatalogInput): Promise<ProductCatalogItem | null> {
  if (input.categoryId) {
    const category = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ?').bind(input.categoryId).first<{ id: string }>();
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, brand, package_size, source, source_product_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user', NULL, 1, ?, ?)
  `).bind(id, input.name, normalizedName(input.name), input.categoryId ?? null, input.iconKey ?? 'shopping-basket', input.brand ?? null, input.packageSize ?? null, now, now).run();
  return getProductCatalogItem(env, id);
}

export async function updateProductCatalogItem(env: Env, productId: string, input: Partial<ProductCatalogInput>): Promise<ProductCatalogItem | null> {
  const current = await env.DB.prepare('SELECT id, name, category_id, icon_key, brand, package_size FROM product_catalog WHERE id = ? AND is_active = 1').bind(productId).first<{
    id: string; name: string; category_id: string | null; icon_key: string; brand: string | null; package_size: string | null;
  }>();
  if (!current) return null;
  const categoryId = input.categoryId === undefined ? current.category_id : input.categoryId;
  if (categoryId) {
    const category = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ?').bind(categoryId).first<{ id: string }>();
    if (!category) throw new Error('CATEGORY_NOT_FOUND');
  }
  const name = input.name ?? current.name;
  await env.DB.prepare(`
    UPDATE product_catalog
    SET name = ?, normalized_name = ?, category_id = ?, icon_key = ?, brand = ?, package_size = ?, updated_at = ?
    WHERE id = ? AND is_active = 1
  `).bind(
    name,
    normalizedName(name),
    categoryId ?? null,
    input.iconKey ?? current.icon_key,
    input.brand === undefined ? current.brand : input.brand,
    input.packageSize === undefined ? current.package_size : input.packageSize,
    new Date().toISOString(),
    productId,
  ).run();
  return getProductCatalogItem(env, productId);
}

export async function deleteProductCatalogItem(env: Env, productId: string): Promise<boolean> {
  const current = await env.DB.prepare('SELECT id FROM product_catalog WHERE id = ? AND is_active = 1').bind(productId).first<{ id: string }>();
  if (!current) return false;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE product_catalog SET is_active = 0, updated_at = ? WHERE id = ?').bind(now, productId),
    env.DB.prepare('DELETE FROM user_product_favorites WHERE product_id = ?').bind(productId),
  ]);
  return true;
}

export async function listProductCatalogSnapshot(env: Env, userId?: string): Promise<ProductCatalogItem[]> {
  const { results } = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id,
      ${userId ? 'CASE WHEN user_product_favorites.product_id IS NULL THEN 0 ELSE 1 END' : '0'} AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    ${userId ? 'LEFT JOIN user_product_favorites ON user_product_favorites.product_id = product_catalog.id AND user_product_favorites.user_id = ?' : ''}
    WHERE product_catalog.is_active = 1
    ORDER BY is_favorite DESC, product_catalog.name ASC
  `).bind(...(userId ? [userId] : [])).all<ProductRow>();

  return results.map(productRow);
}

async function getProductCategory(env: Env, categoryId: string): Promise<ProductCategory | null> {
  const row = await env.DB.prepare('SELECT * FROM product_categories WHERE id = ?').bind(categoryId).first<CategoryRow>();
  return row ? {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    parentId: row.parent_id,
    iconKey: row.icon_key,
    source: row.source,
    sourceCategoryId: row.source_category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } : null;
}

async function getProductCatalogItem(env: Env, productId: string): Promise<ProductCatalogItem | null> {
  const row = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id, 0 AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    WHERE product_catalog.id = ? AND product_catalog.is_active = 1
  `).bind(productId).first<ProductRow>();
  return row ? productRow(row) : null;
}

export async function searchProductCatalog(env: Env, search: string, limit: number, userId?: string): Promise<ProductCatalogItem[]> {
  const normalizedSearch = `%${normalizedName(search)}%`;
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const { results } = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id,
      ${userId ? 'CASE WHEN user_product_favorites.product_id IS NULL THEN 0 ELSE 1 END' : '0'} AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    ${userId ? 'LEFT JOIN user_product_favorites ON user_product_favorites.product_id = product_catalog.id AND user_product_favorites.user_id = ?' : ''}
    WHERE product_catalog.is_active = 1
      AND (
        product_catalog.normalized_name LIKE ?
        OR EXISTS (
          SELECT 1 FROM product_aliases
          WHERE product_aliases.product_id = product_catalog.id
            AND product_aliases.normalized_alias LIKE ?
        )
      )
    ORDER BY is_favorite DESC, product_catalog.name ASC
    LIMIT ?
  `).bind(...(userId ? [userId] : []), normalizedSearch, normalizedSearch, safeLimit).all<ProductRow>();

  return results.map(productRow);
}

export async function setProductFavorite(env: Env, userId: string, productId: string, favorite: boolean): Promise<boolean> {
  const product = await env.DB.prepare('SELECT id FROM product_catalog WHERE id = ? AND is_active = 1').bind(productId).first<{ id: string }>();
  if (!product) return false;
  if (favorite) {
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO user_product_favorites (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO NOTHING')
      .bind(userId, productId, now)
      .run();
  } else {
    await env.DB.prepare('DELETE FROM user_product_favorites WHERE user_id = ? AND product_id = ?').bind(userId, productId).run();
  }
  return true;
}

function productRow(row: ProductRow): ProductCatalogItem {
  return {
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
    isFavorite: row.is_favorite === 1,
  };
}
