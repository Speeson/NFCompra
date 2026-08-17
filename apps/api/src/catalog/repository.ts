import type { Env } from '../env';
import { isHouseholdMember } from '../households/repository';
import { normalizedName } from '../lists/validation.ts';

export type CatalogScope = 'system' | 'household';

export interface CatalogPermissions {
  canEdit: boolean;
  canDelete: boolean;
}

export interface CatalogViewContext {
  userId?: string;
  isAdmin: boolean;
  householdId?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  normalizedName: string;
  parentId: string | null;
  iconKey: string;
  source: string | null;
  sourceCategoryId: string | null;
  scope: CatalogScope;
  householdId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
  permissions?: CatalogPermissions;
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
  scope: CatalogScope;
  householdId: string | null;
  createdBy: string | null;
  isFavorite: boolean;
  permissions?: CatalogPermissions;
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

export interface CatalogWriteContext {
  scope: CatalogScope;
  householdId: string | null;
  createdBy: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  normalized_name: string;
  parent_id: string | null;
  icon_key: string;
  source: string | null;
  source_category_id: string | null;
  scope: CatalogScope;
  household_id: string | null;
  created_by: string | null;
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
  scope: CatalogScope;
  household_id: string | null;
  created_by: string | null;
  is_favorite?: number | null;
}

interface CatalogVersionRow {
  version: string | null;
  product_count: number;
}

export async function listProductCategories(env: Env, ctx: CatalogViewContext): Promise<ProductCategory[]> {
  const whereSql = ctx.householdId
    ? "(scope = 'system' OR (scope = 'household' AND household_id = ?))"
    : "scope = 'system'";
  const { results } = await env.DB.prepare(`
    SELECT * FROM product_categories
    WHERE ${whereSql}
    ORDER BY name ASC
  `).bind(...(ctx.householdId ? [ctx.householdId] : [])).all<CategoryRow>();
  const categories = results.map((row) => categoryRow(row, ctx));
  if (!ctx.userId) return categories;
  return [
    {
      id: 'favorites',
      name: 'Favoritos',
      normalizedName: 'favoritos',
      parentId: null,
      iconKey: 'star',
      source: 'user',
      sourceCategoryId: null,
      scope: 'system',
      householdId: null,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      isFavorite: true,
    },
    ...categories,
  ];
}

export async function getProductCatalogVersion(env: Env, householdId?: string): Promise<{ version: string; productCount: number }> {
  const system = await env.DB.prepare(`
    SELECT MAX(updated_at) AS version, COUNT(*) AS product_count
    FROM product_catalog
    WHERE is_active = 1 AND scope = 'system'
  `).first<CatalogVersionRow>();
  let version = system?.version ?? null;
  let productCount = system?.product_count ?? 0;
  if (householdId) {
    const household = await env.DB.prepare(`
      SELECT MAX(updated_at) AS version, COUNT(*) AS product_count
      FROM product_catalog
      WHERE is_active = 1 AND scope = 'household' AND household_id = ?
    `).bind(householdId).first<CatalogVersionRow>();
    if (household?.version && (!version || household.version > version)) version = household.version;
    productCount += household?.product_count ?? 0;
  }
  return {
    version: version ?? 'empty',
    productCount,
  };
}

export async function createProductCategory(env: Env, input: ProductCategoryInput, write: CatalogWriteContext): Promise<ProductCategory | null> {
  const duplicate = await findDuplicateCategory(env, input.name, write.scope, write.householdId);
  if (duplicate) return null;
  if (input.parentId) await validateCategoryReference(env, input.parentId, write.scope, write.householdId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO product_categories (id, name, normalized_name, parent_id, icon_key, source, source_category_id, scope, household_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'user', NULL, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.name,
    normalizedName(input.name),
    input.parentId ?? null,
    input.iconKey ?? 'shopping-basket',
    write.scope,
    write.householdId,
    write.createdBy,
    now,
    now,
  ).run();
  return getProductCategory(env, id, { userId: write.createdBy ?? undefined, isAdmin: false, householdId: write.householdId ?? undefined });
}

export async function updateProductCategory(env: Env, categoryId: string, input: Partial<ProductCategoryInput>, write: CatalogWriteContext): Promise<ProductCategory | null> {
  const current = await env.DB.prepare('SELECT id, name, parent_id, icon_key FROM product_categories WHERE id = ? AND scope = ? AND household_id IS ?').bind(categoryId, write.scope, write.householdId ?? null).first<{
    id: string; name: string; parent_id: string | null; icon_key: string;
  }>();
  if (!current) return null;
  const name = input.name ?? current.name;
  const parentId = input.parentId === undefined ? current.parent_id : input.parentId;
  if (parentId) {
    if (parentId === categoryId) throw new Error('CATEGORY_PARENT_INVALID');
    await validateCategoryReference(env, parentId, write.scope, write.householdId);
  }
  const duplicate = await findDuplicateCategory(env, name, write.scope, write.householdId, categoryId);
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
  return getProductCategory(env, categoryId, { userId: write.createdBy ?? undefined, isAdmin: false, householdId: write.householdId ?? undefined });
}

export async function deleteProductCategory(env: Env, categoryId: string, write: CatalogWriteContext): Promise<boolean> {
  const current = await env.DB.prepare('SELECT id FROM product_categories WHERE id = ? AND scope = ? AND household_id IS ?').bind(categoryId, write.scope, write.householdId ?? null).first<{ id: string }>();
  if (!current) return false;
  await env.DB.batch([
    env.DB.prepare('UPDATE product_catalog SET category_id = NULL, updated_at = ? WHERE category_id = ?').bind(new Date().toISOString(), categoryId),
    env.DB.prepare('UPDATE product_categories SET parent_id = NULL, updated_at = ? WHERE parent_id = ?').bind(new Date().toISOString(), categoryId),
    env.DB.prepare('DELETE FROM product_categories WHERE id = ?').bind(categoryId),
  ]);
  return true;
}

export async function createProductCatalogItem(env: Env, input: ProductCatalogInput, write: CatalogWriteContext): Promise<ProductCatalogItem | null> {
  if (input.categoryId) await validateCategoryReference(env, input.categoryId, write.scope, write.householdId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO product_catalog (id, name, normalized_name, category_id, icon_key, brand, package_size, source, source_product_id, scope, household_id, created_by, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user', NULL, ?, ?, ?, 1, ?, ?)
  `).bind(
    id,
    input.name,
    normalizedName(input.name),
    input.categoryId ?? null,
    input.iconKey ?? 'shopping-basket',
    input.brand ?? null,
    input.packageSize ?? null,
    write.scope,
    write.householdId,
    write.createdBy,
    now,
    now,
  ).run();
  return getProductCatalogItem(env, id, { userId: write.createdBy ?? undefined, isAdmin: false, householdId: write.householdId ?? undefined });
}

export async function updateProductCatalogItem(env: Env, productId: string, input: Partial<ProductCatalogInput>, write: CatalogWriteContext): Promise<ProductCatalogItem | null> {
  const current = await env.DB.prepare('SELECT id, name, category_id, icon_key, brand, package_size FROM product_catalog WHERE id = ? AND is_active = 1 AND scope = ? AND household_id IS ?').bind(productId, write.scope, write.householdId ?? null).first<{
    id: string; name: string; category_id: string | null; icon_key: string; brand: string | null; package_size: string | null;
  }>();
  if (!current) return null;
  const categoryId = input.categoryId === undefined ? current.category_id : input.categoryId;
  if (categoryId) await validateCategoryReference(env, categoryId, write.scope, write.householdId);
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
  return getProductCatalogItem(env, productId, { userId: write.createdBy ?? undefined, isAdmin: false, householdId: write.householdId ?? undefined });
}

export async function deleteProductCatalogItem(env: Env, productId: string, write: CatalogWriteContext): Promise<boolean> {
  const current = await env.DB.prepare('SELECT id FROM product_catalog WHERE id = ? AND is_active = 1 AND scope = ? AND household_id IS ?').bind(productId, write.scope, write.householdId ?? null).first<{ id: string }>();
  if (!current) return false;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE product_catalog SET is_active = 0, updated_at = ? WHERE id = ?').bind(now, productId),
    env.DB.prepare('DELETE FROM user_product_favorites WHERE product_id = ?').bind(productId),
  ]);
  return true;
}

export async function listProductCatalogSnapshot(env: Env, ctx: CatalogViewContext): Promise<ProductCatalogItem[]> {
  const { sql, params } = scopeClause(ctx);
  const userIdParam = ctx.userId ? [ctx.userId] : [];
  const { results } = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id, product_catalog.scope, product_catalog.household_id, product_catalog.created_by,
      ${ctx.userId ? 'CASE WHEN user_product_favorites.product_id IS NULL THEN 0 ELSE 1 END' : '0'} AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    ${ctx.userId ? 'LEFT JOIN user_product_favorites ON user_product_favorites.product_id = product_catalog.id AND user_product_favorites.user_id = ?' : ''}
    WHERE product_catalog.is_active = 1
      AND (${sql})
    ORDER BY is_favorite DESC,
      CASE WHEN product_catalog.scope = 'household' THEN 0 ELSE 1 END,
      product_catalog.name ASC
  `).bind(...userIdParam, ...params).all<ProductRow>();

  return results.map((row) => productRow(row, ctx));
}

export async function searchProductCatalog(env: Env, search: string, limit: number, ctx: CatalogViewContext): Promise<ProductCatalogItem[]> {
  const normalizedSearch = `%${normalizedName(search)}%`;
  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const { sql, params } = scopeClause(ctx);
  const userIdParam = ctx.userId ? [ctx.userId] : [];
  const { results } = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id, product_catalog.scope, product_catalog.household_id, product_catalog.created_by,
      ${ctx.userId ? 'CASE WHEN user_product_favorites.product_id IS NULL THEN 0 ELSE 1 END' : '0'} AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    ${ctx.userId ? 'LEFT JOIN user_product_favorites ON user_product_favorites.product_id = product_catalog.id AND user_product_favorites.user_id = ?' : ''}
    WHERE product_catalog.is_active = 1
      AND (${sql})
      AND (
        product_catalog.normalized_name LIKE ?
        OR EXISTS (
          SELECT 1 FROM product_aliases
          WHERE product_aliases.product_id = product_catalog.id
            AND product_aliases.normalized_alias LIKE ?
        )
      )
    ORDER BY is_favorite DESC,
      CASE WHEN product_catalog.scope = 'household' THEN 0 ELSE 1 END,
      product_catalog.name ASC
    LIMIT ?
  `).bind(...userIdParam, ...params, normalizedSearch, normalizedSearch, safeLimit).all<ProductRow>();

  return results.map((row) => productRow(row, ctx));
}

export async function setProductFavorite(env: Env, userId: string, productId: string, favorite: boolean): Promise<'ok' | 'not_found' | 'forbidden'> {
  const product = await env.DB.prepare('SELECT scope, household_id FROM product_catalog WHERE id = ? AND is_active = 1').bind(productId).first<{ scope: CatalogScope; household_id: string | null }>();
  if (!product) return 'not_found';
  if (product.scope === 'household' && !(await isHouseholdMember(env, product.household_id!, userId))) return 'forbidden';
  if (favorite) {
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO user_product_favorites (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO NOTHING')
      .bind(userId, productId, now)
      .run();
  } else {
    await env.DB.prepare('DELETE FROM user_product_favorites WHERE user_id = ? AND product_id = ?').bind(userId, productId).run();
  }
  return 'ok';
}

export async function deleteHouseholdCatalog(env: Env, householdId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_product_favorites WHERE product_id IN (SELECT id FROM product_catalog WHERE scope = \'household\' AND household_id = ?)').bind(householdId),
    env.DB.prepare('DELETE FROM product_catalog WHERE scope = \'household\' AND household_id = ?').bind(householdId),
    env.DB.prepare('DELETE FROM product_categories WHERE scope = \'household\' AND household_id = ?').bind(householdId),
  ]);
}

async function getProductCategory(env: Env, categoryId: string, ctx: CatalogViewContext): Promise<ProductCategory | null> {
  const row = await env.DB.prepare('SELECT * FROM product_categories WHERE id = ?').bind(categoryId).first<CategoryRow>();
  return row ? categoryRow(row, ctx) : null;
}

async function getProductCatalogItem(env: Env, productId: string, ctx: CatalogViewContext): Promise<ProductCatalogItem | null> {
  const row = await env.DB.prepare(`
    SELECT product_catalog.id, product_catalog.name, product_catalog.normalized_name, product_catalog.category_id,
      product_categories.name AS category_name, product_catalog.icon_key, product_catalog.brand, product_catalog.package_size,
      product_catalog.source, product_catalog.source_product_id, product_catalog.scope, product_catalog.household_id, product_catalog.created_by,
      0 AS is_favorite
    FROM product_catalog
    LEFT JOIN product_categories ON product_categories.id = product_catalog.category_id
    WHERE product_catalog.id = ? AND product_catalog.is_active = 1
  `).bind(productId).first<ProductRow>();
  return row ? productRow(row, ctx) : null;
}

async function findDuplicateCategory(env: Env, name: string, scope: CatalogScope, householdId: string | null, excludeId?: string): Promise<{ id: string } | null> {
  const normalized = normalizedName(name);
  if (scope === 'system') {
    if (excludeId) {
      return env.DB.prepare('SELECT id FROM product_categories WHERE scope = \'system\' AND normalized_name = ? AND id <> ?').bind(normalized, excludeId).first<{ id: string }>();
    }
    return env.DB.prepare('SELECT id FROM product_categories WHERE scope = \'system\' AND normalized_name = ?').bind(normalized).first<{ id: string }>();
  }
  if (excludeId) {
    return env.DB.prepare('SELECT id FROM product_categories WHERE scope = \'household\' AND household_id = ? AND normalized_name = ? AND id <> ?').bind(householdId, normalized, excludeId).first<{ id: string }>();
  }
  return env.DB.prepare('SELECT id FROM product_categories WHERE scope = \'household\' AND household_id = ? AND normalized_name = ?').bind(householdId, normalized).first<{ id: string }>();
}

async function validateCategoryReference(env: Env, categoryId: string, scope: CatalogScope, householdId: string | null): Promise<void> {
  const row = await env.DB.prepare('SELECT scope, household_id FROM product_categories WHERE id = ?').bind(categoryId).first<{ scope: CatalogScope; household_id: string | null }>();
  if (!row) throw new Error('CATEGORY_NOT_FOUND');
  if (scope === 'system') {
    if (row.scope !== 'system') throw new Error('CATEGORY_SCOPE_MISMATCH');
  } else if (row.scope === 'household' && row.household_id !== householdId) {
    throw new Error('CATEGORY_SCOPE_MISMATCH');
  }
}

function scopeClause(ctx: CatalogViewContext): { sql: string; params: unknown[] } {
  if (ctx.householdId) {
    return {
      sql: "product_catalog.scope = 'system' OR (product_catalog.scope = 'household' AND product_catalog.household_id = ?)",
      params: [ctx.householdId],
    };
  }
  return { sql: "product_catalog.scope = 'system'", params: [] };
}

function categoryPermissions(ctx: CatalogViewContext, scope: CatalogScope, householdId: string | null): CatalogPermissions | undefined {
  if (!ctx.userId) return undefined;
  const canEdit = scope === 'system'
    ? ctx.isAdmin
    : ctx.householdId != null && ctx.householdId === householdId;
  return { canEdit, canDelete: canEdit };
}

function productPermissions(ctx: CatalogViewContext, scope: CatalogScope, householdId: string | null): CatalogPermissions | undefined {
  if (!ctx.userId) return undefined;
  const canEdit = scope === 'system'
    ? ctx.isAdmin
    : ctx.householdId != null && ctx.householdId === householdId;
  return { canEdit, canDelete: canEdit };
}

function categoryRow(row: CategoryRow, ctx: CatalogViewContext): ProductCategory {
  const permissions = categoryPermissions(ctx, row.scope, row.household_id);
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    parentId: row.parent_id,
    iconKey: row.icon_key,
    source: row.source,
    sourceCategoryId: row.source_category_id,
    scope: row.scope,
    householdId: row.household_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(permissions ? { permissions } : {}),
  };
}

function productRow(row: ProductRow, ctx: CatalogViewContext): ProductCatalogItem {
  const permissions = productPermissions(ctx, row.scope, row.household_id);
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
    scope: row.scope,
    householdId: row.household_id,
    createdBy: row.created_by,
    isFavorite: row.is_favorite === 1,
    ...(permissions ? { permissions } : {}),
  };
}
