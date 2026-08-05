import type { Env } from '../env';
import type { AuthUser } from '../middleware/auth';
import { errorResponse } from '../shared/http';
import { getProductCatalogVersion, listProductCatalogSnapshot, listProductCategories, searchProductCatalog, setProductFavorite } from './repository';

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
