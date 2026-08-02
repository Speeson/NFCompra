import type { Env } from '../env';
import { listProductCategories, searchProductCatalog } from './repository';

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

  return null;
}
