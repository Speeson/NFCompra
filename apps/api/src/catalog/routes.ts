import type { Env } from '../env';
import type { AuthUser } from '../middleware/auth';
import { errorResponse } from '../shared/http';
import { boundedText, jsonObject } from '../lists/validation';
import {
  createProductCatalogItem,
  createProductCategory,
  deleteProductCatalogItem,
  deleteProductCategory,
  getProductCatalogVersion,
  listProductCatalogSnapshot,
  listProductCategories,
  searchProductCatalog,
  setProductFavorite,
  updateProductCatalogItem,
  updateProductCategory,
} from './repository';
import type { ProductCatalogInput, ProductCategoryInput } from './repository';

export async function handleCatalogRoute(request: Request, env: Env, user?: AuthUser): Promise<Response | null> {
  const url = new URL(request.url);

  const favoriteMatch = url.pathname.match(/^\/v1\/product-catalog\/([^/]+)\/favorite$/);
  if (favoriteMatch) {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
    if (request.method !== 'POST' && request.method !== 'DELETE') return null;
    const productId = decodeURIComponent(favoriteMatch[1]);
    const found = await setProductFavorite(env, user.id, productId, request.method === 'POST');
    if (!found) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
    return Response.json({ productId, isFavorite: request.method === 'POST' });
  }

  const categoryMatch = url.pathname.match(/^\/v1\/product-categories\/([^/]+)$/);
  if (url.pathname === '/v1/product-categories' && request.method === 'POST') {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesiÃ³n.', 401);
    const input = await createCategoryInput(request);
    if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categorÃ­a invÃ¡lidos.', 400);
    try {
      const category = await createProductCategory(env, input);
      if (!category) return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categorÃ­a con ese nombre.', 409);
      return Response.json({ category }, { status: 201 });
    } catch {
      return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'CategorÃ­a padre no encontrada.', 404);
    }
  }
  if (categoryMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesiÃ³n.', 401);
    const categoryId = decodeURIComponent(categoryMatch[1]);
    if (categoryId === 'favorites') return errorResponse('CATEGORY_RESERVED', 'La categorÃ­a Favoritos no se puede modificar.', 400);
    if (request.method === 'DELETE') {
      const deleted = await deleteProductCategory(env, categoryId);
      if (!deleted) return errorResponse('CATEGORY_NOT_FOUND', 'CategorÃ­a no encontrada.', 404);
      return Response.json({ status: 'deleted' });
    }
    const input = await categoryInput(request, true);
    if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categorÃ­a invÃ¡lidos.', 400);
    try {
      const category = await updateProductCategory(env, categoryId, input);
      if (!category) return errorResponse('CATEGORY_NOT_FOUND', 'CategorÃ­a no encontrada.', 404);
      return Response.json({ category });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_DUPLICATE') return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categorÃ­a con ese nombre.', 409);
      if (error instanceof Error && error.message === 'CATEGORY_PARENT_INVALID') return errorResponse('CATEGORY_PARENT_INVALID', 'Una categorÃ­a no puede ser su propia padre.', 400);
      return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'CategorÃ­a padre no encontrada.', 404);
    }
  }

  const productMatch = url.pathname.match(/^\/v1\/product-catalog\/([^/]+)$/);
  if (url.pathname === '/v1/product-catalog' && request.method === 'POST') {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesiÃ³n.', 401);
    const input = await createProductInput(request);
    if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto invÃ¡lidos.', 400);
    try {
      const product = await createProductCatalogItem(env, input);
      return Response.json({ product }, { status: 201 });
    } catch {
      return errorResponse('CATEGORY_NOT_FOUND', 'CategorÃ­a no encontrada.', 404);
    }
  }
  if (productMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesiÃ³n.', 401);
    const productId = decodeURIComponent(productMatch[1]);
    if (request.method === 'DELETE') {
      const deleted = await deleteProductCatalogItem(env, productId);
      if (!deleted) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      return Response.json({ status: 'deleted' });
    }
    const input = await productInput(request, true);
    if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto invÃ¡lidos.', 400);
    try {
      const product = await updateProductCatalogItem(env, productId, input);
      if (!product) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      return Response.json({ product });
    } catch {
      return errorResponse('CATEGORY_NOT_FOUND', 'CategorÃ­a no encontrada.', 404);
    }
  }

  if (request.method !== 'GET') return null;

  if (url.pathname === '/v1/product-categories') {
    return Response.json({ categories: await listProductCategories(env, user?.id) });
  }

  if (url.pathname === '/v1/product-catalog') {
    const search = url.searchParams.get('search')?.trim() ?? '';
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
    if (search.length < 2) return Response.json({ products: [] });
    return Response.json({ products: await searchProductCatalog(env, search, Number.isFinite(limit) ? limit : 10, user?.id) });
  }

  if (url.pathname === '/v1/product-catalog/version') {
    return Response.json(await getProductCatalogVersion(env));
  }

  if (url.pathname === '/v1/product-catalog/snapshot') {
    const version = await getProductCatalogVersion(env);
    return Response.json({ ...version, products: await listProductCatalogSnapshot(env, user?.id) });
  }

  return null;
}

async function createCategoryInput(request: Request): Promise<ProductCategoryInput | null> {
  const input = await categoryInput(request, false);
  return input && input.name ? input as ProductCategoryInput : null;
}

async function createProductInput(request: Request): Promise<ProductCatalogInput | null> {
  const input = await productInput(request, false);
  return input && input.name ? input as ProductCatalogInput : null;
}

async function categoryInput(request: Request, partial: boolean): Promise<Partial<ProductCategoryInput> | null> {
  const body = await jsonObject(request);
  if (!body) return null;
  const name = body.name === undefined && partial ? undefined : boundedText(body.name, 80);
  const iconKey = body.iconKey === undefined ? undefined : boundedText(body.iconKey, 40);
  const parentId = nullableText(body.parentId, 80);
  if (name === null || iconKey === null || invalidNullableText(body.parentId, parentId)) return null;
  if (!partial && !name) return null;
  if (partial && name === undefined && iconKey === undefined && parentId === undefined) return null;
  return { ...(name !== undefined ? { name } : {}), ...(iconKey !== undefined ? { iconKey } : {}), ...(parentId !== undefined ? { parentId } : {}) };
}

async function productInput(request: Request, partial: boolean): Promise<Partial<ProductCatalogInput> | null> {
  const body = await jsonObject(request);
  if (!body) return null;
  const name = body.name === undefined && partial ? undefined : boundedText(body.name, 120);
  const categoryId = nullableText(body.categoryId, 80);
  const iconKey = body.iconKey === undefined ? undefined : boundedText(body.iconKey, 40);
  const brand = nullableText(body.brand, 80);
  const packageSize = nullableText(body.packageSize, 60);
  if (
    name === null
    || invalidNullableText(body.categoryId, categoryId)
    || iconKey === null
    || invalidNullableText(body.brand, brand)
    || invalidNullableText(body.packageSize, packageSize)
  ) return null;
  if (!partial && !name) return null;
  if (partial && name === undefined && categoryId === undefined && iconKey === undefined && brand === undefined && packageSize === undefined) return null;
  return {
    ...(name !== undefined ? { name } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(iconKey !== undefined ? { iconKey } : {}),
    ...(brand !== undefined ? { brand } : {}),
    ...(packageSize !== undefined ? { packageSize } : {}),
  };
}

function nullableText(value: unknown, maximumLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return boundedText(value, maximumLength) ?? null;
}

function invalidNullableText(source: unknown, parsed: string | null | undefined): boolean {
  return source !== undefined && source !== null && parsed === null;
}
