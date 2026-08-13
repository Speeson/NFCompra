import { useMemo, useState, type FormEvent, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProductCatalogCard } from './ProductCatalogCards';
import {
  createProductCatalogItem,
  createProductCategory,
  deleteProductCatalogItem,
  deleteProductCategory,
  fetchProductCategories,
  loadProductCatalogSnapshot,
  setProductFavorite,
  updateProductCatalogItem,
  updateProductCategory,
  type ProductCatalogInput,
  type ProductCatalogItem,
  type ProductCategory,
  type ProductCategoryInput,
} from './product-catalog-api';

const catalogProductsQueryKey = ['product-catalog', 'snapshot'] as const;
const catalogCategoriesQueryKey = ['product-categories'] as const;
type CatalogSearchFilter = 'all' | 'favorites' | 'category';
type CatalogCreateMode = 'category' | 'product';
const catalogIconOptions = [
  { value: 'shopping-basket', label: '🛒 General' },
  { value: 'milk', label: '🥛 Lácteos' },
  { value: 'bread', label: '🥖 Panadería' },
  { value: 'fish', label: '🐟 Pescado' },
  { value: 'meat', label: '🥩 Carne' },
  { value: 'fruit', label: '🍎 Fruta' },
  { value: 'vegetable', label: '🥕 Verdura' },
  { value: 'clean', label: '🧽 Limpieza' },
  { value: 'water-drink', label: '💧 Bebidas' },
  { value: 'frozen', label: '🧊 Congelados' },
  { value: 'cheese', label: '🧀 Quesos' },
  { value: 'butter', label: '🧈 Mantequilla' },
  { value: 'egg', label: '🥚 Huevos' },
  { value: 'flour', label: '🌾 Harina' },
  { value: 'spices', label: '🧂 Sal y especias' },
  { value: 'rice-pasta', label: '🍚 Arroz y pasta' },
  { value: 'pasta', label: '🍝 Pasta' },
  { value: 'beans', label: '🫘 Legumbres' },
  { value: 'canned', label: '🥫 Conservas' },
  { value: 'snacks', label: '🥨 Aperitivos' },
  { value: 'coffee', label: '☕ Café e infusiones' },
  { value: 'sauce', label: '🫙 Salsas' },
  { value: 'oil', label: '🫒 Aceite y aceitunas' },
  { value: 'sweet', label: '🍫 Dulces' },
  { value: 'cookies', label: '🍪 Galletas y cereales' },
  { value: 'soup', label: '🥣 Caldos y cremas' },
  { value: 'dessert', label: '🍮 Postres' },
  { value: 'pizza', label: '🍕 Platos preparados' },
  { value: 'juice', label: '🧃 Zumos' },
  { value: 'wine', label: '🍷 Bodega' },
  { value: 'beer', label: '🍺 Cerveza' },
  { value: 'pet', label: '🐾 Mascotas' },
  { value: 'hygiene', label: '🧴 Higiene' },
  { value: 'soap', label: '🧼 Detergente' },
  { value: 'paper', label: '🧻 Papel' },
  { value: 'tomato', label: '🍅 Tomate' },
  { value: 'potato', label: '🥔 Patata' },
  { value: 'onion', label: '🧅 Cebolla' },
  { value: 'garlic', label: '🧄 Ajo' },
  { value: 'banana', label: '🍌 Plátano' },
  { value: 'citrus', label: '🍊 Cítricos' },
] as const;
type CatalogDialogState =
  | { kind: 'create'; mode: CatalogCreateMode }
  | { kind: 'edit-category'; category: ProductCategory }
  | { kind: 'edit-product'; product: ProductCatalogItem }
  | null;
type CatalogMenuPosition = { top: number; left: number } | null;

export function CatalogPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState('favorites');
  const [search, setSearch] = useState('');
  const [searchFilter, setSearchFilter] = useState<CatalogSearchFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [dialog, setDialog] = useState<CatalogDialogState>(null);
  const [categoryMenuId, setCategoryMenuId] = useState<string | null>(null);
  const [categoryMenuPosition, setCategoryMenuPosition] = useState<CatalogMenuPosition>(null);
  const [productMenuId, setProductMenuId] = useState<string | null>(null);
  const categories = useQuery({ queryKey: catalogCategoriesQueryKey, queryFn: fetchProductCategories });
  const products = useQuery({ queryKey: catalogProductsQueryKey, queryFn: loadProductCatalogSnapshot });

  const invalidateCatalog = () => {
    void queryClient.invalidateQueries({ queryKey: catalogCategoriesQueryKey });
    void queryClient.invalidateQueries({ queryKey: catalogProductsQueryKey });
  };

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

  const categoryMutation = useMutation({
    mutationFn: ({ categoryId, input }: { categoryId?: string; input: ProductCategoryInput }) =>
      categoryId ? updateProductCategory(categoryId, input) : createProductCategory(input),
    onSuccess: invalidateCatalog,
  });
  const productMutation = useMutation({
    mutationFn: ({ productId, input }: { productId?: string; input: ProductCatalogInput }) =>
      productId ? updateProductCatalogItem(productId, input) : createProductCatalogItem(input),
    onSuccess: invalidateCatalog,
  });
  const deleteCategoryMutation = useMutation({
    mutationFn: deleteProductCategory,
    onSuccess: invalidateCatalog,
  });
  const deleteProductMutation = useMutation({
    mutationFn: deleteProductCatalogItem,
    onSuccess: invalidateCatalog,
  });

  const categoryList = categories.data ?? [];
  const productList = products.data ?? [];
  const selectedCategory = categoryList.find((category) => category.id === selectedCategoryId) ?? categoryList[0];
  const categoryWithOpenActions = categoryList.find((category) => category.id === categoryMenuId);
  const normalCategories = categoryList.filter((category) => !category.isFavorite && category.id !== 'favorites');
  const busy = categoryMutation.isPending || productMutation.isPending || deleteCategoryMutation.isPending || deleteProductMutation.isPending;
  const visibleProducts = useMemo(() => {
    const query = normalize(search);
    return productList.filter((product) => {
      const matchesCategory = selectedCategoryId === 'favorites' ? product.isFavorite : product.categoryId === selectedCategoryId;
      if (!query) return matchesCategory;
      const matchesQuery = normalize(`${product.name} ${product.categoryName ?? ''} ${product.packageSize ?? ''} ${product.brand ?? ''}`).includes(query);
      if (!matchesQuery) return false;
      if (searchFilter === 'favorites') return product.isFavorite;
      if (searchFilter === 'category') return matchesCategory;
      return true;
    }).slice(0, 80);
  }, [productList, search, searchFilter, selectedCategoryId]);

  const openCategoryActions = (category: ProductCategory, anchor: HTMLElement) => {
    if (category.isFavorite || category.id === 'favorites') return;
    const rect = anchor.getBoundingClientRect();
    setProductMenuId(null);
    setCategoryMenuId((current) => {
      const next = current === category.id ? null : category.id;
      if (!next) {
        setCategoryMenuPosition(null);
        return null;
      }
      setCategoryMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 204)),
      });
      return next;
    });
  };

  return <section className="catalog-page">
    <header className="catalog-page__header">
      <div className="catalog-page__title"><p className="eyebrow">Catálogo</p><h1>Catálogo</h1></div>
      <div className="catalog-search-group">
        <label className="catalog-search">Buscar productos<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Leche, pan, tomate..." autoComplete="off" /></label>
        <button className="catalog-filter-button" type="button" aria-label="Abrir filtros de búsqueda" aria-expanded={isFilterOpen} onClick={() => setIsFilterOpen(true)}>
          <span aria-hidden="true"></span>
        </button>
        <button className="catalog-create-button" type="button" aria-label="Crear en catálogo" onClick={() => setDialog({ kind: 'create', mode: 'category' })}><span aria-hidden="true">+</span></button>
      </div>
    </header>
    {isFilterOpen ? <CatalogFilterDialog
      value={searchFilter}
      onChange={(nextFilter) => {
        setSearchFilter(nextFilter);
        setIsFilterOpen(false);
      }}
      onClose={() => setIsFilterOpen(false)}
    /> : null}
    {dialog ? <CatalogEntryDialog
      state={dialog}
      categories={normalCategories}
      selectedCategoryId={selectedCategory?.id === 'favorites' ? normalCategories[0]?.id : selectedCategory?.id}
      isSaving={categoryMutation.isPending || productMutation.isPending}
      onModeChange={(mode) => setDialog({ kind: 'create', mode })}
      onClose={() => setDialog(null)}
      onSubmitCategory={(input, categoryId) => categoryMutation.mutate({ categoryId, input }, { onSuccess: () => setDialog(null) })}
      onSubmitProduct={(input, productId) => productMutation.mutate({ productId, input }, { onSuccess: () => setDialog(null) })}
    /> : null}
    {categoryWithOpenActions ? <div
      className="catalog-category-menu-layer"
      style={categoryMenuPosition ? { top: categoryMenuPosition.top, left: categoryMenuPosition.left } : undefined}
    >
      <CatalogActionMenu
        type="category"
        onEdit={() => {
          setCategoryMenuId(null);
          setCategoryMenuPosition(null);
          setDialog({ kind: 'edit-category', category: categoryWithOpenActions });
        }}
        onDelete={() => {
          setCategoryMenuId(null);
          setCategoryMenuPosition(null);
          if (window.confirm(`Eliminar categoría ${categoryWithOpenActions.name}?`)) deleteCategoryMutation.mutate(categoryWithOpenActions.id);
        }}
      />
    </div> : null}
    {categories.isPending || products.isPending ? <p role="status">Cargando catálogo...</p> : null}
    {categories.isError || products.isError ? <p role="alert">No se pudo cargar el catálogo.</p> : null}
    <div className="catalog-page__body">
      <nav className="catalog-categories" aria-label="Categorías del catálogo">
        {categoryList.map((category) => <div key={category.id} className={selectedCategoryId === category.id ? 'catalog-category-entry is-selected' : 'catalog-category-entry'}>
          <button
            type="button"
            className="catalog-category-entry__main"
            aria-pressed={selectedCategoryId === category.id}
            onClick={(event) => {
              if (selectedCategoryId === category.id) openCategoryActions(category, event.currentTarget);
              else {
                setSelectedCategoryId(category.id);
                setCategoryMenuId(null);
                setCategoryMenuPosition(null);
              }
            }}
          >
            <span aria-hidden="true">{category.id === 'favorites' ? '★' : categoryIcon(category.iconKey)}</span>
            <strong>{category.name}</strong>
          </button>
        </div>)}
      </nav>
      <section className="product-card-results catalog-products" aria-label="Productos del catálogo">
        {!products.isPending && !visibleProducts.length ? <p className="empty-state">No hay productos para esta selección.</p> : null}
        {visibleProducts.map((product) => <div key={product.id} className="catalog-product-entry">
          <ProductCatalogCard
            product={product}
            disabled={favoriteMutation.isPending || busy}
            statusLabel={product.packageSize ?? null}
            onFavoriteChange={(entry, favorite) => favoriteMutation.mutate({ productId: entry.id, favorite })}
            onOpenActions={(entry) => {
              setCategoryMenuId(null);
              setProductMenuId((current) => current === entry.id ? null : entry.id);
            }}
          />
          {productMenuId === product.id ? <CatalogActionMenu
            type="product"
            onEdit={() => {
              setProductMenuId(null);
              setDialog({ kind: 'edit-product', product });
            }}
            onDelete={() => {
              setProductMenuId(null);
              if (window.confirm(`Eliminar producto ${product.name}?`)) deleteProductMutation.mutate(product.id);
            }}
          /> : null}
        </div>)}
      </section>
    </div>
  </section>;
}
function CatalogEntryDialog({
  state,
  categories,
  selectedCategoryId,
  isSaving,
  onModeChange,
  onClose,
  onSubmitCategory,
  onSubmitProduct,
}: {
  state: Exclude<CatalogDialogState, null>;
  categories: ProductCategory[];
  selectedCategoryId?: string;
  isSaving: boolean;
  onModeChange(mode: CatalogCreateMode): void;
  onClose(): void;
  onSubmitCategory(input: ProductCategoryInput, categoryId?: string): void;
  onSubmitProduct(input: ProductCatalogInput, productId?: string): void;
}): JSX.Element {
  const mode: CatalogCreateMode = state.kind === 'edit-product' ? 'product' : state.kind === 'edit-category' ? 'category' : state.mode;
  const category = state.kind === 'edit-category' ? state.category : null;
  const product = state.kind === 'edit-product' ? state.product : null;
  const [categoryName, setCategoryName] = useState(category?.name ?? '');
  const [categoryIconKey, setCategoryIconKey] = useState(category?.iconKey ?? 'shopping-basket');
  const [productName, setProductName] = useState(product?.name ?? '');
  const [productCategoryId, setProductCategoryId] = useState(product?.categoryId ?? selectedCategoryId ?? categories[0]?.id ?? '');
  const [productIconKey, setProductIconKey] = useState(product?.iconKey ?? 'shopping-basket');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [packageSize, setPackageSize] = useState(product?.packageSize ?? '');
  const canChangeMode = state.kind === 'create';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'category') {
      if (!categoryName.trim()) return;
      onSubmitCategory({ name: categoryName.trim(), iconKey: categoryIconKey.trim() || 'shopping-basket' }, category?.id);
      return;
    }
    if (!productName.trim()) return;
    onSubmitProduct({
      name: productName.trim(),
      categoryId: productCategoryId || null,
      iconKey: productIconKey.trim() || 'shopping-basket',
      brand: brand.trim() || null,
      packageSize: packageSize.trim() || null,
    }, product?.id);
  };

  return <div className="catalog-filter-backdrop" role="presentation" onClick={onClose}>
    <form className="catalog-entry-dialog" role="dialog" aria-modal="true" aria-label="Crear" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <header className="catalog-filter-dialog__header">
        <div><p className="eyebrow">{state.kind === 'create' ? 'Nuevo' : 'Editar'}</p><h2>Crear</h2></div>
        <button className="catalog-filter-dialog__close" type="button" aria-label="Cerrar" onClick={onClose}>×</button>
      </header>
      <div className="catalog-entry-mode" role="group" aria-label="Tipo de entrada">
        <button type="button" aria-pressed={mode === 'category'} disabled={!canChangeMode} onClick={() => onModeChange('category')}>Categoría</button>
        <button type="button" aria-pressed={mode === 'product'} disabled={!canChangeMode} onClick={() => onModeChange('product')}>Producto</button>
      </div>
      {mode === 'category' ? <div className="catalog-entry-fields">
        <label>Nombre de la categoría<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required maxLength={80} autoFocus /></label>
        <label>Icono de la categoría<span className="catalog-select-field">
          <select value={categoryIconKey} onChange={(event) => setCategoryIconKey(event.target.value)}>
            {catalogIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </span></label>
      </div> : <div className="catalog-entry-fields">
        <label>Nombre del producto<input value={productName} onChange={(event) => setProductName(event.target.value)} required maxLength={120} autoFocus /></label>
        <label>Categoría del producto<span className="catalog-select-field catalog-select-field--category">
          <select value={productCategoryId} onChange={(event) => setProductCategoryId(event.target.value)}>
            <option value="">Sin categoría</option>
            {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </span></label>
        <label>Icono del producto<span className="catalog-select-field">
          <select value={productIconKey} onChange={(event) => setProductIconKey(event.target.value)}>
            {catalogIconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </span></label>
        <label>Marca del producto<input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={80} placeholder="Opcional" /></label>
        <label>Tamaño del producto<input value={packageSize} onChange={(event) => setPackageSize(event.target.value)} maxLength={60} placeholder="Opcional" /></label>
      </div>}
      <div className="catalog-entry-dialog__actions">
        <button className="button button--quiet" type="button" onClick={onClose}>Cancelar</button>
        <button className="button" type="submit" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Crear'}</button>
      </div>
    </form>
  </div>;
}

function CatalogActionMenu({ type, onEdit, onDelete }: { type: 'category' | 'product'; onEdit(): void; onDelete(): void }): JSX.Element {
  return <div className="catalog-action-menu">
    <button type="button" onClick={onEdit}>Editar {type === 'category' ? 'categoría' : 'producto'}</button>
    <button type="button" className="catalog-action-menu__danger" onClick={onDelete}>Eliminar {type === 'category' ? 'categoría' : 'producto'}</button>
  </div>;
}

function CatalogFilterDialog({ value, onChange, onClose }: { value: CatalogSearchFilter; onChange(value: CatalogSearchFilter): void; onClose(): void }): JSX.Element {
  const options: Array<{ value: CatalogSearchFilter; label: string; description: string }> = [
    { value: 'all', label: 'Todos los productos', description: 'Busca en todo el catálogo.' },
    { value: 'favorites', label: 'Favoritos', description: 'Muestra solo tus productos guardados.' },
    { value: 'category', label: 'Categoría seleccionada', description: 'Limita la búsqueda a la categoría abierta.' },
  ];

  return <div className="catalog-filter-backdrop" role="presentation" onClick={onClose}>
    <section className="catalog-filter-dialog" role="dialog" aria-modal="true" aria-label="Filtro de búsqueda" onClick={(event) => event.stopPropagation()}>
      <header className="catalog-filter-dialog__header">
        <div><p className="eyebrow">Filtro</p>
        <h2>Filtro de búsqueda</h2>
        </div>
        <button className="catalog-filter-dialog__close" type="button" aria-label="Cerrar filtros" onClick={onClose}>×</button>
      </header>
      <div className="catalog-filter-options">
        {options.map((option) => <label key={option.value} className="catalog-filter-option">
          <input type="radio" name="catalog-search-filter" aria-label={option.label} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span aria-hidden="true"></span>
          <strong>{option.label}</strong>
          <small>{option.description}</small>
        </label>)}
      </div>
    </section>
  </div>;
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
  if (key.includes('fruit') || key.includes('apple')) return '🍎';
  if (key.includes('vegetable') || key.includes('carrot')) return '🥕';
  if (key.includes('clean')) return '🧽';
  if (key.includes('water') || key.includes('drink') || key.includes('bottle')) return '💧';
  if (key.includes('frozen')) return '🧊';
  if (key.includes('cheese')) return '🧀';
  if (key.includes('butter')) return '🧈';
  if (key.includes('egg')) return '🥚';
  if (key.includes('flour')) return '🌾';
  if (key.includes('spice')) return '🧂';
  if (key.includes('rice-pasta') || key.includes('rice')) return '🍚';
  if (key.includes('pasta')) return '🍝';
  if (key.includes('beans')) return '🫘';
  if (key.includes('oil')) return '🫒';
  if (key.includes('canned') || key.includes('can')) return '🥫';
  if (key.includes('snack')) return '🥨';
  if (key.includes('coffee')) return '☕';
  if (key.includes('sauce')) return '🫙';
  if (key.includes('sweet') || key.includes('chocolate')) return '🍫';
  if (key.includes('candy')) return '🍬';
  if (key.includes('cookie')) return '🍪';
  if (key.includes('soup')) return '🥣';
  if (key.includes('dessert')) return '🍮';
  if (key.includes('pizza')) return '🍕';
  if (key.includes('juice')) return '🧃';
  if (key.includes('wine')) return '🍷';
  if (key.includes('beer')) return '🍺';
  if (key.includes('pet')) return '🐾';
  if (key.includes('hygiene')) return '🧴';
  if (key.includes('soap') || key.includes('detergent')) return '🧼';
  if (key.includes('paper')) return '🧻';
  if (key.includes('makeup')) return '💄';
  if (key.includes('baby')) return '🍼';
  if (key.includes('tomato')) return '🍅';
  if (key.includes('potato')) return '🥔';
  if (key.includes('onion')) return '🧅';
  if (key.includes('garlic')) return '🧄';
  if (key.includes('banana')) return '🍌';
  if (key.includes('citrus')) return '🍊';
  return '🛒';
}
