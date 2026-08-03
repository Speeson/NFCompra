import { useEffect, useRef, useState, type JSX } from 'react';
import { QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../../api/client';
import { HouseholdSetup } from '../households/HouseholdSetup';
import { notificationsQueryKey, unreadNotificationsQueryKey } from '../notifications/notification-api';
import { ShoppingListScreen } from './ShoppingListScreen';
import { loadOfflineList, saveOfflineList } from './offline-cache';
import { createHousehold, createItem, createList, deleteCheckedItems, deleteItem, deleteList, fetchHouseholds, fetchItems, fetchLists, householdQueryKey, itemQueryKey, listQueryKey, updateItem, updateList, type ApiShoppingItem, type ShoppingList } from './queries';

type ItemPatch = Partial<Pick<ApiShoppingItem, 'name' | 'quantity' | 'unit' | 'isChecked'>>;
type UpdateVariables = { item: ApiShoppingItem; patch: ItemPatch };
type UpdateContext = { listId: string; itemId: string; revision: number };
type OptimisticUpdate = { revision: number; patch: ItemPatch };
type OptimisticItemState = { base: ApiShoppingItem; updates: OptimisticUpdate[] };
type CreateContext = { listId: string; optimisticId: string };
type DeleteContext = { listId: string; item: ApiShoppingItem };
type DeleteListContext = { householdId: string; list: ShoppingList; previousListId: string };
type OfflineSnapshot = { source: string; items: ApiShoppingItem[] };

export function createWebQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

export function ShoppingListRoute({ currentUserId = '', requestedHouseholdId, requestedListId, onNavigate }: { currentUserId?: string; requestedHouseholdId?: string | null; requestedListId?: string | null; onNavigate?(path: string): void }): JSX.Element {
  const queryClient = useQueryClient();
  const [householdId, setHouseholdId] = useState<string | undefined>(() => requestedHouseholdId ?? new URL(window.location.href).searchParams.get('household') ?? undefined);
  const [listId, setListId] = useState<string | undefined>(() => requestedListId ?? new URL(window.location.href).searchParams.get('list') ?? undefined);
  const appliedRouteRequest = useRef<string | undefined>(undefined);
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState<{ current: ApiShoppingItem; retry: () => void }>();
  const [offlineSnapshot, setOfflineSnapshot] = useState<OfflineSnapshot | null>(null);
  const activeOfflineSource = useRef(offlineSource(currentUserId, listId ?? ''));
  const latestItemsRequest = useRef(0);
  const currentOfflineSource = offlineSource(currentUserId, listId ?? '');
  if (activeOfflineSource.current !== currentOfflineSource) activeOfflineSource.current = currentOfflineSource;
  const nextRevision = useRef(0);
  const optimisticItems = useRef(new Map<string, OptimisticItemState>());
  const householdsQuery = useQuery({ queryKey: householdQueryKey, queryFn: fetchHouseholds });
  const isDirectListRoute = Boolean(requestedListId && !requestedHouseholdId);
  const ownershipQueries = useQueries({ queries: isDirectListRoute ? (householdsQuery.data ?? []).map((household) => ({ queryKey: listQueryKey(household.id), queryFn: () => fetchLists(household.id) })) : [] });
  const resolvedHouseholdId = isDirectListRoute ? householdsQuery.data?.find((_household, index) => (ownershipQueries[index]?.data ?? []).some((list) => list.id === requestedListId))?.id : undefined;
  const listsQuery = useQuery({ queryKey: listQueryKey(householdId ?? ''), queryFn: () => fetchLists(householdId!), enabled: Boolean(householdId) });
  const itemsQuery = useQuery({
    queryKey: itemQueryKey(listId ?? ''), queryFn: async () => {
      const requestedUserId = currentUserId;
      const requestedListId = listId!;
      const source = offlineSource(requestedUserId, requestedListId);
      const requestGeneration = ++latestItemsRequest.current;
      const isCurrentRequest = () => activeOfflineSource.current === source && latestItemsRequest.current === requestGeneration;
      try {
        const items = await fetchItems(requestedListId);
        if (requestedUserId) void saveOfflineList(requestedUserId, requestedListId, items).catch(() => undefined);
        if (isCurrentRequest()) setOfflineSnapshot((snapshot) => snapshot?.source === source ? null : snapshot);
        return items;
      } catch (error) {
        if (!navigator.onLine && requestedUserId) {
          const cachedItems = await loadOfflineList(requestedUserId, requestedListId);
          if (cachedItems) {
            if (isCurrentRequest()) setOfflineSnapshot({ source, items: cachedItems });
            return cachedItems;
          }
        }
        throw error;
      }
    }, enabled: Boolean(listId),
    refetchInterval: 15_000, refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const refresh = () => { void itemsQuery.refetch(); };
    window.addEventListener('online', refresh);
    return () => window.removeEventListener('online', refresh);
  }, [itemsQuery.refetch]);
  useEffect(() => {
    if (!requestedHouseholdId) return;
    const routeRequest = `${requestedHouseholdId}:${requestedListId ?? ''}`;
    if (appliedRouteRequest.current === routeRequest) return;
    appliedRouteRequest.current = routeRequest;
    setHouseholdId(requestedHouseholdId);
    setListId(requestedListId ?? undefined);
  }, [requestedHouseholdId, requestedListId]);
  useEffect(() => {
    if (!resolvedHouseholdId || !requestedListId) return;
    setHouseholdId(resolvedHouseholdId);
    setListId(requestedListId);
  }, [requestedListId, resolvedHouseholdId]);
  useEffect(() => {
    const households = householdsQuery.data ?? [];
    const first = households[0];
    if (isDirectListRoute && !householdId) return;
    if (first && !households.some((household) => household.id === householdId)) setHouseholdId(first.id);
  }, [householdId, householdsQuery.data, isDirectListRoute]);
  useEffect(() => {
    const lists = listsQuery.data ?? [];
    const first = lists[0];
    if (first && !lists.some((list) => list.id === listId)) setListId(first.id);
  }, [listId, listsQuery.data]);

  const isOffline = offlineSnapshot?.source === offlineSource(currentUserId, listId ?? '');
  const isDirectOfflineRoute = Boolean(requestedListId && !householdId && isOffline && !itemsQuery.isPending);
  function resetFeedback(): void { setMessage(undefined); setConflict(undefined); }
  function invalidateNotifications(): void {
    void queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey, exact: true });
  }
  function keyFor(list: string, item: string): string { return `${list}:${item}`; }
  function replaceCurrentItem(list: string, current: ApiShoppingItem): void {
    queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(list), (items) => items?.map((item) => item.id === current.id ? current : item));
  }
  function resolvedItem(state: OptimisticItemState): ApiShoppingItem {
    return state.updates.reduce((item, update) => ({ ...item, ...update.patch }), state.base);
  }
  function settleUpdate(context: UpdateContext | undefined, confirmed?: ApiShoppingItem): boolean {
    if (!context) return false;
    const key = keyFor(context.listId, context.itemId);
    const state = optimisticItems.current.get(key);
    if (!state) return false;
    const index = state.updates.findIndex((update) => update.revision === context.revision);
    if (index < 0) return false;
    if (confirmed) state.base = confirmed;
    state.updates.splice(index, 1);
    replaceCurrentItem(context.listId, resolvedItem(state));
    if (state.updates.length === 0) optimisticItems.current.delete(key);
    return true;
  }
  function restoreDeleted(context: DeleteContext | undefined): void {
    if (!context) return;
    queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(context.listId), (items = []) => items.some((item) => item.id === context.item.id) ? items : [...items, context.item]);
  }

  const updateMutation = useMutation<ApiShoppingItem, Error, UpdateVariables, UpdateContext>({
    mutationFn: ({ item, patch }) => updateItem(item, patch, operationId()),
    onMutate: async (variables) => {
      resetFeedback();
      await queryClient.cancelQueries({ queryKey: itemQueryKey(variables.item.listId) });
      const key = keyFor(variables.item.listId, variables.item.id);
      const current = queryClient.getQueryData<ApiShoppingItem[]>(itemQueryKey(variables.item.listId))?.find((item) => item.id === variables.item.id) ?? variables.item;
      const revision = ++nextRevision.current;
      const state = optimisticItems.current.get(key) ?? { base: current, updates: [] };
      state.updates.push({ revision, patch: variables.patch });
      optimisticItems.current.set(key, state);
      replaceCurrentItem(variables.item.listId, resolvedItem(state));
      return { listId: variables.item.listId, itemId: variables.item.id, revision };
    },
    onError: (error, variables, context) => {
      if (error instanceof ApiError && error.status === 409 && error.code === 'OPERATION_IN_PROGRESS') {
        if (settleUpdate(context)) void queryClient.invalidateQueries({ queryKey: itemQueryKey(variables.item.listId) });
        setMessage('La operación sigue en curso. Se ha actualizado la lista.');
        return;
      }
      const current = error instanceof ApiError ? error.details.current : undefined;
      if (error instanceof ApiError && error.status === 409 && error.code === 'ITEM_VERSION_CONFLICT' && isShoppingItem(current)) {
        if (settleUpdate(context, current)) {
          setConflict({ current, retry: () => updateMutation.mutate({ item: current, patch: variables.patch }) });
        }
        return;
      }
      settleUpdate(context);
      setMessage('No se pudo guardar el cambio.');
    },
    onSuccess: (item, _variables, context) => { settleUpdate(context, item); invalidateNotifications(); },
  });

  const createItemMutation = useMutation<ApiShoppingItem, Error, { listId: string; name: string; quantity: number; unit: string | null }, CreateContext>({
    mutationFn: ({ listId: targetListId, name, quantity, unit }) => createItem(targetListId, { name, quantity, unit, operationId: operationId() }),
    onMutate: async (variables) => {
      resetFeedback();
      await queryClient.cancelQueries({ queryKey: itemQueryKey(variables.listId) });
      const optimistic = optimisticItem(variables);
      queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(variables.listId), (items = []) => [...items, optimistic]);
      return { listId: variables.listId, optimisticId: optimistic.id };
    },
    onError: (error, variables, context) => {
      queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(variables.listId), (items) => items?.filter((item) => item.id !== context?.optimisticId));
      if (error instanceof ApiError && error.status === 409 && error.code === 'OPERATION_IN_PROGRESS') void queryClient.invalidateQueries({ queryKey: itemQueryKey(variables.listId) });
      setMessage('No se pudo guardar el cambio.');
    },
    onSuccess: (item, _variables, context) => {
      queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(item.listId), (items) => items?.map((candidate) => candidate.id === context?.optimisticId ? item : candidate));
      invalidateNotifications();
    },
  });

  const deleteMutation = useMutation<void, Error, ApiShoppingItem, DeleteContext>({
    mutationFn: (item) => deleteItem(item, operationId()),
    onMutate: async (item) => {
      resetFeedback();
      await queryClient.cancelQueries({ queryKey: itemQueryKey(item.listId) });
      queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(item.listId), (items) => items?.filter((candidate) => candidate.id !== item.id));
      return { listId: item.listId, item };
    },
    onError: (error, item, context) => {
      if (error instanceof ApiError && error.status === 409 && error.code === 'OPERATION_IN_PROGRESS') {
        restoreDeleted(context);
        void queryClient.invalidateQueries({ queryKey: itemQueryKey(item.listId) });
      } else if (error instanceof ApiError && error.status === 409 && error.code === 'ITEM_VERSION_CONFLICT') {
        const current = error.details.current;
        if (isShoppingItem(current)) {
          replaceCurrentItem(item.listId, current);
          setConflict({ current, retry: () => deleteMutation.mutate(current) });
        } else restoreDeleted(context);
      } else restoreDeleted(context);
      setMessage('No se pudo guardar el cambio.');
    },
    onSuccess: () => invalidateNotifications(),
  });

  const householdMutation = useMutation({
    mutationFn: createHousehold,
    onMutate: () => resetFeedback(),
    onSuccess: ({ household, defaultList }) => {
      queryClient.setQueryData(householdQueryKey, (households: typeof householdsQuery.data = []) => [...households, household]);
      queryClient.setQueryData(listQueryKey(household.id), [defaultList]);
      setHouseholdId(household.id); setListId(defaultList.id);
    },
    onError: () => setMessage('No se pudo crear el hogar.'),
  });
  const listMutation = useMutation({
    mutationFn: ({ targetHouseholdId, name }: { targetHouseholdId: string; name: string }) => createList(targetHouseholdId, name),
    onMutate: () => resetFeedback(),
    onSuccess: (list) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchLists>>>(listQueryKey(list.householdId), (lists = []) => [...lists, list]);
      setListId(list.id);
    },
    onError: () => setMessage('No se pudo crear la lista.'),
  });
  const renameListMutation = useMutation<ShoppingList, Error, { list: ShoppingList; name: string }>({
    mutationFn: ({ list, name }) => updateList(list, name, operationId()),
    onMutate: () => resetFeedback(),
    onSuccess: (updated) => {
      queryClient.setQueryData<ShoppingList[]>(listQueryKey(updated.householdId), (lists = []) => lists.map((list) => list.id === updated.id ? updated : list));
      invalidateNotifications();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.code === 'LIST_VERSION_CONFLICT') void queryClient.invalidateQueries({ queryKey: listQueryKey(householdId ?? '') });
      setMessage(error instanceof ApiError && error.code === 'DEFAULT_LIST_CANNOT_BE_DELETED' ? 'La lista predeterminada no se puede eliminar.' : 'No se pudo cambiar el nombre de la lista.');
    },
  });
  const clearCheckedMutation = useMutation<number, Error, string>({
    mutationFn: (targetListId) => deleteCheckedItems(targetListId, operationId()),
    onMutate: () => resetFeedback(),
    onSuccess: (_removed, targetListId) => {
      queryClient.setQueryData<ApiShoppingItem[]>(itemQueryKey(targetListId), (items = []) => items.filter((item) => !item.isChecked));
      invalidateNotifications();
    },
    onError: () => setMessage('No se pudo vaciar la lista.'),
  });
  const deleteListMutation = useMutation<void, Error, ShoppingList, DeleteListContext>({
    mutationFn: (list) => deleteList(list, operationId()),
    onMutate: async (list) => {
      resetFeedback();
      await queryClient.cancelQueries({ queryKey: listQueryKey(list.householdId) });
      queryClient.setQueryData<ShoppingList[]>(listQueryKey(list.householdId), (lists = []) => lists.filter((candidate) => candidate.id !== list.id));
      if (listId === list.id) {
        const fallback = queryClient.getQueryData<ShoppingList[]>(listQueryKey(list.householdId))?.[0];
        setListId(fallback?.id);
      }
      return { householdId: list.householdId, list, previousListId: listId ?? '' };
    },
    onError: (error, _list, context) => {
      if (context) {
        queryClient.setQueryData<ShoppingList[]>(listQueryKey(context.householdId), (lists = []) => lists.some((list) => list.id === context.list.id) ? lists : [...lists, context.list]);
        if (context.previousListId) setListId(context.previousListId);
      }
      setMessage(error instanceof ApiError && error.code === 'DEFAULT_LIST_CANNOT_BE_DELETED' ? 'La lista predeterminada no se puede eliminar.' : 'No se pudo eliminar la lista.');
    },
    onSuccess: (_unused, list) => {
      queryClient.removeQueries({ queryKey: itemQueryKey(list.id), exact: true });
      invalidateNotifications();
    },
  });

  if (isDirectOfflineRoute) return <ShoppingListScreen title="Lista" items={(itemsQuery.data ?? []).map((item) => ({ ...item, unit: item.unit ?? undefined }))} isOffline />;
  if (householdsQuery.isPending) return <main><p role="status">Cargando hogares…</p></main>;
  if (householdsQuery.isError) return <main><p role="alert">No se pudieron cargar los hogares.</p></main>;
  if (isDirectListRoute && !resolvedHouseholdId && ownershipQueries.some((query) => query.isError)) return <main><p role="alert">No se pudo localizar la lista.</p></main>;
  if (isDirectListRoute && !resolvedHouseholdId && ownershipQueries.some((query) => query.isPending)) return <main><p role="status">Cargando lista…</p></main>;
  if (isDirectListRoute && !resolvedHouseholdId && ownershipQueries.length > 0) return <main><p role="alert">No se encontró esta lista.</p></main>;
  if (!householdsQuery.data?.length) return <HouseholdSetup onCreate={async (name) => { try { await householdMutation.mutateAsync(name); } catch { /* mutation exposes feedback */ } }} isCreating={householdMutation.isPending} error={message} />;
  if (!householdId || listsQuery.isPending || !listId || itemsQuery.isPending) return <main><p role="status">Cargando lista…</p></main>;
  if (listsQuery.isError || itemsQuery.isError) return <main><p role="alert">No se pudo cargar la lista.</p></main>;

  const currentHousehold = householdsQuery.data.find((household) => household.id === householdId);
  const currentList = listsQuery.data?.find((list) => list.id === listId);
  return <>
    {onNavigate ? <button className="back-link back-link--route" type="button" onClick={() => currentHousehold ? onNavigate(`/households/${encodeURIComponent(currentHousehold.id)}`) : onNavigate('/lists')}>← Volver a {currentHousehold?.name ?? 'listas'}</button> : null}
    <section className="list-selectors" aria-label="Seleccionar hogar y lista">
      <label>Hogar<select disabled={isOffline} value={householdId} onChange={(event) => { setHouseholdId(event.target.value); setListId(undefined); }}>{householdsQuery.data.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label>
      <label>Lista<select disabled={isOffline} value={listId} onChange={(event) => setListId(event.target.value)}>{listsQuery.data?.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
      <NewListForm disabled={isOffline} onCreate={(name) => { if (!isOffline) listMutation.mutate({ targetHouseholdId: householdId, name }); }} />
    </section>
    {message ? <p role="alert">{message}</p> : null}
    {conflict ? <aside role="alert">El producto ha cambiado en el servidor: {conflict.current.name} (versión {conflict.current.version}). <button type="button" disabled={isOffline} onClick={() => { if (!isOffline) conflict.retry(); }}>Reintentar</button></aside> : null}
    <ShoppingListScreen title={currentList?.name ?? 'Lista'} items={(itemsQuery.data ?? []).map((item) => ({ ...item, unit: item.unit ?? undefined }))} isOffline={isOffline}
      onAdd={(input) => { if (!isOffline) createItemMutation.mutate({ listId, ...input }); }}
      onRenameList={(name) => { if (!isOffline && currentList) renameListMutation.mutate({ list: currentList, name }); }}
      onClearChecked={() => { if (!isOffline && window.confirm('Se eliminarán los productos comprados de esta lista.')) clearCheckedMutation.mutate(listId); }}
      onDeleteList={currentList && !currentList.isDefault ? () => { if (!isOffline && window.confirm('Se eliminará esta lista y sus productos.')) deleteListMutation.mutate(currentList); } : undefined}
      onToggle={(item) => { if (!isOffline) updateMutation.mutate({ item: item as ApiShoppingItem, patch: { isChecked: !item.isChecked } }); }}
      onUpdate={(item, input) => { if (!isOffline) updateMutation.mutate({ item: item as ApiShoppingItem, patch: input }); }}
      onDelete={(item) => { if (!isOffline) deleteMutation.mutate(item as ApiShoppingItem); }} />
  </>;
}

function NewListForm({ disabled, onCreate }: { disabled: boolean; onCreate(name: string): void }): JSX.Element {
  const [name, setName] = useState('');
  return <form onSubmit={(event) => { event.preventDefault(); if (!disabled && name.trim()) { onCreate(name.trim()); setName(''); } }}><label htmlFor="new-list-name">Nueva lista</label><input id="new-list-name" disabled={disabled} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /><button type="submit" disabled={disabled}>Crear lista</button></form>;
}

function operationId(): string { return crypto.randomUUID(); }
function offlineSource(userId: string, listId: string): string { return `${userId}:${listId}`; }
function optimisticItem({ listId, name, quantity, unit }: { listId: string; name: string; quantity: number; unit: string | null }): ApiShoppingItem {
  const now = new Date().toISOString();
  return { id: `optimistic-${operationId()}`, listId, name, normalizedName: name.toLocaleLowerCase(), quantity, unit, category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: '', updatedBy: '', createdAt: now, updatedAt: now };
}
function isShoppingItem(value: unknown): value is ApiShoppingItem {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string' && typeof (value as { version?: unknown }).version === 'number';
}
