import { apiClient } from '../../api/session';

export type Household = { id: string; name: string; ownerId: string; createdAt: string; updatedAt: string };
export type ShoppingList = { id: string; householdId: string; name: string; isDefault: boolean; version: number; createdAt: string; updatedAt: string };
export type ApiShoppingItem = {
  id: string; listId: string; name: string; normalizedName: string; quantity: number; unit: string | null; category: string | null; note: string | null;
  isChecked: boolean; position: number; version: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
};

export const householdQueryKey = ['households'] as const;
export const listQueryKey = (householdId: string) => ['households', householdId, 'lists'] as const;
export const itemQueryKey = (listId: string) => ['lists', listId, 'items'] as const;

export async function fetchHouseholds(): Promise<Household[]> {
  return (await apiClient.request<{ households: Household[] }>('/households')).households;
}

export async function createHousehold(name: string): Promise<{ household: Household }> {
  return apiClient.request('/households', { method: 'POST', body: { name } });
}

export async function fetchLists(householdId: string): Promise<ShoppingList[]> {
  return (await apiClient.request<{ lists: ShoppingList[] }>(`/households/${householdId}/lists`)).lists;
}

export async function createList(householdId: string, name: string): Promise<ShoppingList> {
  return (await apiClient.request<{ list: ShoppingList }>(`/households/${householdId}/lists`, { method: 'POST', body: { name } })).list;
}

export async function updateList(list: ShoppingList, name: string, operationId: string): Promise<ShoppingList> {
  return (await apiClient.request<{ list: ShoppingList }>(`/lists/${list.id}`, { method: 'PATCH', body: { name, expectedVersion: list.version, operationId } })).list;
}

export async function deleteList(list: ShoppingList, operationId: string): Promise<void> {
  await apiClient.request(`/lists/${list.id}`, { method: 'DELETE', body: { expectedVersion: list.version, operationId } });
}

export async function fetchItems(listId: string): Promise<ApiShoppingItem[]> {
  return (await apiClient.request<{ items: ApiShoppingItem[] }>(`/lists/${listId}/items`)).items;
}

export async function createItem(listId: string, input: { name: string; quantity: number; unit: string | null; operationId: string }): Promise<ApiShoppingItem> {
  return (await apiClient.request<{ item: ApiShoppingItem }>(`/lists/${listId}/items`, { method: 'POST', body: input })).item;
}

export async function updateItem(item: ApiShoppingItem, patch: Partial<Pick<ApiShoppingItem, 'name' | 'quantity' | 'unit' | 'isChecked'>>, operationId: string): Promise<ApiShoppingItem> {
  return (await apiClient.request<{ item: ApiShoppingItem }>(`/items/${item.id}`, { method: 'PATCH', body: { ...patch, expectedVersion: item.version, operationId } })).item;
}

export async function deleteItem(item: ApiShoppingItem, operationId: string): Promise<void> {
  await apiClient.request(`/items/${item.id}`, { method: 'DELETE', body: { expectedVersion: item.version, operationId } });
}

export async function deleteCheckedItems(listId: string, operationId: string): Promise<number> {
  return (await apiClient.request<{ removed: number }>(`/lists/${listId}/items/checked`, { method: 'DELETE', body: { operationId } })).removed;
}
