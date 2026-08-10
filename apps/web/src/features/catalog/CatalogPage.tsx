import { useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProductCatalogCard } from './ProductCatalogCards';
import { fetchProductCategories, loadProductCatalogSnapshot, setProductFavorite, type ProductCatalogItem } from './product-catalog-api';

const catalogProductsQueryKey = ['product-catalog', 'snapshot'] as const;
const catalogCategoriesQueryKey = ['product-categories'] as const;

export function CatalogPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState('favorites');
  const [search, setSearch] = useState('');
  const categories = useQuery({ queryKey: catalogCategoriesQueryKey, queryFn: fetchProductCategories });
  const products = useQuery({ queryKey: catalogProductsQueryKey, queryFn: loadProductCatalogSnapshot });
  const favoriteMutation = useMutation({
    mutationFn: ({ productId, favorite }: { productId: string; favorite: boolean }) => setProductFavorite(productId, favorite),
    onMutate: async ({ productId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: catalogProductsQueryKey });
      const previous = queryClient.getQueryData<ProductCatalogItem[]>(catalogProductsQueryKey);
      queryClient.setQueryData<ProductCatalogItem[]>(catalogProductsQueryKey, (current) => current?.map((product) => product.id === productId ? { ...product, isFavorite: favorite } : product));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(catalogProductsQueryKey, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: catalogProductsQueryKey }),
  });

  const categoryList = categories.data ?? [];
  const productList = products.data ?? [];
  const visibleProducts = useMemo(() => {
    const query = normalize(search);
    return productList.filter((product) => {
      const matchesCategory = selectedCategoryId === 'favorites' ? product.isFavorite : product.categoryId === selectedCategoryId;
      if (!matchesCategory) return false;
      if (!query) return true;
      return normalize(`${product.name} ${product.categoryName ?? ''} ${product.packageSize ?? ''}`).includes(query);
    }).slice(0, 80);
  }, [productList, search, selectedCategoryId]);

  return <section className="catalog-page">
    <header className="catalog-page__header">
      <div><p className="eyebrow">Catálogo</p><h1>Productos y favoritos</h1></div>
      <label className="catalog-search">Buscar productos<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Leche, pan, tomate..." autoComplete="off" /></label>
    </header>
    {categories.isPending || products.isPending ? <p role="status">Cargando catálogo...</p> : null}
    {categories.isError || products.isError ? <p role="alert">No se pudo cargar el catálogo.</p> : null}
    <div className="catalog-page__body">
      <nav className="catalog-categories" aria-label="Categorías del catálogo">
        {categoryList.map((category) => <button key={category.id} type="button" aria-pressed={selectedCategoryId === category.id} onClick={() => setSelectedCategoryId(category.id)}>
          <span aria-hidden="true">{category.id === 'favorites' ? '★' : categoryIcon(category.iconKey)}</span>
          <strong>{category.name}</strong>
        </button>)}
      </nav>
      <section className="product-card-results catalog-products" aria-label="Productos del catálogo">
        {!products.isPending && !visibleProducts.length ? <p className="empty-state">No hay productos para esta selección.</p> : null}
        {visibleProducts.map((product) => <ProductCatalogCard
          key={product.id}
          product={product}
          disabled={favoriteMutation.isPending}
          statusLabel={product.packageSize ?? null}
          onFavoriteChange={(entry, favorite) => favoriteMutation.mutate({ productId: entry.id, favorite })}
        />)}
      </section>
    </div>
  </section>;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function categoryIcon(iconKey: string): string {
  const key = normalize(iconKey);
  if (key.includes('milk')) return '🥛';
  if (key.includes('bread')) return '🥖';
  if (key.includes('fish')) return '🐟';
  if (key.includes('meat')) return '🥩';
  if (key.includes('fruit')) return '🍎';
  if (key.includes('vegetable')) return '🥕';
  if (key.includes('clean')) return '🧽';
  return '🛒';
}
