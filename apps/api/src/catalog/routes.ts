import type { Env } from '../env';
import type { AuthUser } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { errorResponse } from '../shared/http';
import { boundedText, jsonObject } from '../lists/validation';
import { findHousehold, isHouseholdMember } from '../households/repository';
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
  type CatalogViewContext,
  type CatalogWriteContext,
  type ProductCatalogInput,
  type ProductCategoryInput,
} from './repository';

type MutationKind = 'category' | 'product';

export async function handleCatalogRoute(request: Request, env: Env, user?: AuthUser): Promise<Response | null> {
  const url = new URL(request.url);

  const householdCategoryMatch = url.pathname.match(/^\/v1\/households\/([^/]+)\/product-categories(?:\/([^/]+))?$/);
  const householdProductMatch = url.pathname.match(/^\/v1\/households\/([^/]+)\/product-catalog(?:\/([^/]+))?$/);
  if (householdCategoryMatch) {
    return handleHouseholdMutation(request, env, user, 'category', householdCategoryMatch[1], householdCategoryMatch[2]);
  }
  if (householdProductMatch) {
    return handleHouseholdMutation(request, env, user, 'product', householdProductMatch[1], householdProductMatch[2]);
  }

  const favoriteMatch = url.pathname.match(/^\/v1\/product-catalog\/([^/]+)\/favorite$/);
  if (favoriteMatch) {
    if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
    if (request.method !== 'POST' && request.method !== 'DELETE') return null;
    const productId = decodeURIComponent(favoriteMatch[1]);
    const result = await setProductFavorite(env, user.id, productId, request.method === 'POST');
    if (result === 'not_found') return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
    if (result === 'forbidden') return errorResponse('FORBIDDEN', 'No puedes acceder a este producto.', 403);
    return Response.json({ productId, isFavorite: request.method === 'POST' });
  }

  const categoryMatch = url.pathname.match(/^\/v1\/product-categories\/([^/]+)$/);
  if (url.pathname === '/v1/product-categories' && request.method === 'POST') {
    const adminError = requireAdmin(user);
    if (adminError) return adminError;
    const input = await createCategoryInput(request);
    if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categoría inválidos.', 400);
    try {
      const category = await createProductCategory(env, input, systemWrite(user));
      if (!category) return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categoría con ese nombre.', 409);
      return Response.json({ category }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'Categoría padre no encontrada.', 404);
    }
  }
  if (categoryMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const adminError = requireAdmin(user);
    if (adminError) return adminError;
    const categoryId = decodeURIComponent(categoryMatch[1]);
    if (categoryId === 'favorites') return errorResponse('CATEGORY_RESERVED', 'La categoría Favoritos no se puede modificar.', 400);
    if (request.method === 'DELETE') {
      const deleted = await deleteProductCategory(env, categoryId, systemWrite(user));
      if (!deleted) return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
      return Response.json({ status: 'deleted' });
    }
    const input = await categoryInput(request, true);
    if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categoría inválidos.', 400);
    try {
      const category = await updateProductCategory(env, categoryId, input, systemWrite(user));
      if (!category) return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
      return Response.json({ category });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_DUPLICATE') return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categoría con ese nombre.', 409);
      if (error instanceof Error && error.message === 'CATEGORY_PARENT_INVALID') return errorResponse('CATEGORY_PARENT_INVALID', 'Una categoría no puede ser su propia padre.', 400);
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'Categoría padre no encontrada.', 404);
    }
  }

  const productMatch = url.pathname.match(/^\/v1\/product-catalog\/([^/]+)$/);
  if (url.pathname === '/v1/product-catalog' && request.method === 'POST') {
    const adminError = requireAdmin(user);
    if (adminError) return adminError;
    const input = await createProductInput(request);
    if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto inválidos.', 400);
    try {
      const product = await createProductCatalogItem(env, input, systemWrite(user));
      return Response.json({ product }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
    }
  }
  if (productMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const adminError = requireAdmin(user);
    if (adminError) return adminError;
    const productId = decodeURIComponent(productMatch[1]);
    if (request.method === 'DELETE') {
      const deleted = await deleteProductCatalogItem(env, productId, systemWrite(user));
      if (!deleted) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      return Response.json({ status: 'deleted' });
    }
    const input = await productInput(request, true);
    if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto inválidos.', 400);
    try {
      const product = await updateProductCatalogItem(env, productId, input, systemWrite(user));
      if (!product) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      return Response.json({ product });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
    }
  }

  if (request.method !== 'GET') return null;

  const householdIdParam = url.searchParams.get('householdId')?.trim() || null;
  const ctx: CatalogViewContext = { userId: user?.id, isAdmin: user?.role === 'admin' };
  if (householdIdParam) {
    if (!user) return errorResponse('FORBIDDEN', 'No puedes acceder a este catálogo.', 403);
    const household = await findHousehold(env, householdIdParam);
    if (!household) return errorResponse('HOUSEHOLD_NOT_FOUND', 'El hogar no existe.', 404);
    if (!(await isHouseholdMember(env, householdIdParam, user.id))) return errorResponse('FORBIDDEN', 'No puedes acceder a este catálogo.', 403);
    ctx.householdId = householdIdParam;
  }

  if (url.pathname === '/v1/product-categories') {
    return Response.json({ categories: await listProductCategories(env, ctx) });
  }

  if (url.pathname === '/v1/product-catalog') {
    const search = url.searchParams.get('search')?.trim() ?? '';
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
    if (search.length < 2) return Response.json({ products: [] });
    return Response.json({ products: await searchProductCatalog(env, search, Number.isFinite(limit) ? limit : 10, ctx) });
  }

  if (url.pathname === '/v1/product-catalog/version') {
    return Response.json(await getProductCatalogVersion(env, ctx.householdId));
  }

  if (url.pathname === '/v1/product-catalog/snapshot') {
    const version = await getProductCatalogVersion(env, ctx.householdId);
    return Response.json({ ...version, products: await listProductCatalogSnapshot(env, ctx) });
  }

  return null;
}

async function handleHouseholdMutation(request: Request, env: Env, user: AuthUser | undefined, kind: MutationKind, householdId: string, resourceId?: string): Promise<Response | null> {
  if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'DELETE') return null;
  if (!user) return errorResponse('UNAUTHORIZED', 'Debes iniciar sesión.', 401);
  const household = await findHousehold(env, householdId);
  if (!household) return errorResponse('HOUSEHOLD_NOT_FOUND', 'El hogar no existe.', 404);
  if (!(await isHouseholdMember(env, householdId, user.id))) return errorResponse('FORBIDDEN', 'No puedes administrar el catálogo de este hogar.', 403);
  const write: CatalogWriteContext = { scope: 'household', householdId, createdBy: user.id };
  if (kind === 'category') return handleCategoryMutation(request, env, write, resourceId);
  return handleProductMutation(request, env, write, resourceId);
}

async function handleCategoryMutation(request: Request, env: Env, write: CatalogWriteContext, categoryId?: string): Promise<Response> {
  if (!categoryId && request.method === 'POST') {
    const input = await createCategoryInput(request);
    if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categoría inválidos.', 400);
    try {
      const category = await createProductCategory(env, input, write);
      if (!category) return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categoría con ese nombre.', 409);
      return Response.json({ category }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'Categoría padre no encontrada.', 404);
    }
  }
  if (!categoryId) return errorResponse('NOT_FOUND', 'Ruta no encontrada.', 404);
  const decodedId = decodeURIComponent(categoryId);
  if (request.method === 'DELETE') {
    const deleted = await deleteProductCategory(env, decodedId, write);
    if (!deleted) return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
    return Response.json({ status: 'deleted' });
  }
  if (request.method !== 'PATCH') return errorResponse('NOT_FOUND', 'Ruta no encontrada.', 404);
  const input = await categoryInput(request, true);
  if (!input) return errorResponse('INVALID_CATEGORY', 'Datos de categoría inválidos.', 400);
  try {
    const category = await updateProductCategory(env, decodedId, input, write);
    if (!category) return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
    return Response.json({ category });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_DUPLICATE') return errorResponse('CATEGORY_DUPLICATE', 'Ya existe una categoría con ese nombre.', 409);
    if (error instanceof Error && error.message === 'CATEGORY_PARENT_INVALID') return errorResponse('CATEGORY_PARENT_INVALID', 'Una categoría no puede ser su propia padre.', 400);
    if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
    return errorResponse('CATEGORY_PARENT_NOT_FOUND', 'Categoría padre no encontrada.', 404);
  }
}

async function handleProductMutation(request: Request, env: Env, write: CatalogWriteContext, productId?: string): Promise<Response> {
  if (!productId && request.method === 'POST') {
    const input = await createProductInput(request);
    if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto inválidos.', 400);
    try {
      const product = await createProductCatalogItem(env, input, write);
      return Response.json({ product }, { status: 201 });
    } catch (error) {
      if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
      return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
    }
  }
  if (!productId) return errorResponse('NOT_FOUND', 'Ruta no encontrada.', 404);
  const decodedId = decodeURIComponent(productId);
  if (request.method === 'DELETE') {
    const deleted = await deleteProductCatalogItem(env, decodedId, write);
    if (!deleted) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
    return Response.json({ status: 'deleted' });
  }
  if (request.method !== 'PATCH') return errorResponse('NOT_FOUND', 'Ruta no encontrada.', 404);
  const input = await productInput(request, true);
  if (!input) return errorResponse('INVALID_PRODUCT', 'Datos de producto inválidos.', 400);
  try {
    const product = await updateProductCatalogItem(env, decodedId, input, write);
    if (!product) return errorResponse('PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
    return Response.json({ product });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_SCOPE_MISMATCH') return errorResponse('CATEGORY_SCOPE_MISMATCH', 'La categoría no pertenece a este ámbito.', 400);
    return errorResponse('CATEGORY_NOT_FOUND', 'Categoría no encontrada.', 404);
  }
}

function systemWrite(user: AuthUser | undefined): CatalogWriteContext {
  return { scope: 'system', householdId: null, createdBy: user?.id ?? null };
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
