import type { Env } from '../env';
import { getProductCatalogVersion, listProductCatalogSnapshot, listProductCategories, searchProductCatalog } from './repository';

export async function handleCatalogRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET') return null;

  if (url.pathname === '/v1/product-categories') {
    return Response.json({ categories: await listProductCategories(env) });
  }

  if (url.pathname === '/v1/product-catalog') {
    const search = url.searchParams.get('search')?.trim() ?? '';
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);
    if (search.length < 2) return Response.json({ products: [] });
    return Response.json({ products: await searchProductCatalog(env, search, Number.isFinite(limit) ? limit : 10) });
  }

  if (url.pathname === '/v1/product-catalog/version') {
    return Response.json(await getProductCatalogVersion(env));
  }

  if (url.pathname === '/v1/product-catalog/snapshot') {
    const version = await getProductCatalogVersion(env);
    return Response.json({ ...version, products: await listProductCatalogSnapshot(env) });
  }

  return null;
}
