import type { ApiShoppingItem } from './queries';

const DATABASE_NAME = 'nfcompra-offline';
const STORE_NAME = 'shopping-lists';

type OfflineListRecord = { userId: string; listId: string; savedAt: string; items: ApiShoppingItem[] };

export type OfflineListCache = {
  activateOfflineLists(userId: string): void;
  saveOfflineList(userId: string, listId: string, items: ApiShoppingItem[]): Promise<void>;
  loadOfflineList(userId: string, listId: string): Promise<ApiShoppingItem[] | null>;
  clearOfflineLists(userId: string): Promise<void>;
};

export function createOfflineCache(factory: IDBFactory | undefined = globalThis.indexedDB): OfflineListCache {
  const signedOutUsers = new Set<string>();
  const pendingWrites = new Map<string, Set<Promise<void>>>();
  async function database(): Promise<IDBDatabase> {
    if (!factory) throw new Error('IndexedDB is not available.');
    const request = factory.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    return requestResult<IDBDatabase>(request);
  }

  return {
    activateOfflineLists(userId) { signedOutUsers.delete(userId); },
    async saveOfflineList(userId, listId, items) {
      if (signedOutUsers.has(userId)) return;
      const write = (async () => {
        const transaction = (await database()).transaction(STORE_NAME, 'readwrite');
        const completed = transactionComplete(transaction);
        const record: OfflineListRecord = { userId, listId, savedAt: new Date().toISOString(), items };
        await requestAndTransaction(transaction.objectStore(STORE_NAME).put(record, cacheKey(userId, listId)), completed);
      })();
      const writes = pendingWrites.get(userId) ?? new Set<Promise<void>>();
      writes.add(write);
      pendingWrites.set(userId, writes);
      try { await write; } finally {
        writes.delete(write);
        if (writes.size === 0) pendingWrites.delete(userId);
      }
    },
    async loadOfflineList(userId, listId) {
      const transaction = (await database()).transaction(STORE_NAME, 'readonly');
      const completed = transactionComplete(transaction);
      const record = await requestAndTransaction<OfflineListRecord | undefined>(transaction.objectStore(STORE_NAME).get(cacheKey(userId, listId)), completed);
      return record?.userId === userId && record.listId === listId ? record.items : null;
    },
    async clearOfflineLists(userId) {
      signedOutUsers.add(userId);
      await Promise.allSettled(pendingWrites.get(userId) ?? []);
      const transaction = (await database()).transaction(STORE_NAME, 'readwrite');
      const completed = transactionComplete(transaction);
      const store = transaction.objectStore(STORE_NAME);
      const records = await requestThenRemainingTransaction(store.getAll(), completed, (values) => values.filter((record) => record.userId === userId).map((record) => requestResult(store.delete(cacheKey(record.userId, record.listId)))));
    },
  };
}

export const { activateOfflineLists, saveOfflineList, loadOfflineList, clearOfflineLists } = createOfflineCache();

function cacheKey(userId: string, listId: string): string { return `${userId}:${listId}`; }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function requestAndTransaction<T>(request: IDBRequest<T>, completed: Promise<void>): Promise<T> {
  const [requestResultState, transactionState] = await Promise.allSettled([requestResult(request), completed]);
  if (requestResultState.status === 'rejected') throw requestResultState.reason;
  if (transactionState.status === 'rejected') throw transactionState.reason;
  return requestResultState.value;
}

async function requestThenRemainingTransaction<T, U>(request: IDBRequest<T>, completed: Promise<void>, remaining: (value: T) => Promise<U>[]): Promise<T> {
  const observedCompletion = completed.then(() => ({ error: undefined }), (error) => ({ error }));
  try {
    const value = await requestResult(request);
    await Promise.all(remaining(value));
    const outcome = await observedCompletion;
    if (outcome.error !== undefined) throw outcome.error;
    return value;
  } catch (error) {
    await observedCompletion;
    throw error;
  }
}
