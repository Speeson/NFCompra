import { describe, expect, it } from 'vitest';

import { createOfflineCache } from './offline-cache';
import type { ApiShoppingItem } from './queries';

const item: ApiShoppingItem = {
  id: 'item-1', listId: 'list-1', name: 'Leche', normalizedName: 'leche', quantity: 1, unit: null,
  category: null, note: null, isChecked: false, position: 0, version: 1, createdBy: 'user-1', updatedBy: 'user-1',
  createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
};

describe('offline list cache', () => {
  it('returns the snapshot saved for the same user and list', async () => {
    const cache = createOfflineCache(new MemoryIdbFactory() as unknown as IDBFactory);

    await cache.saveOfflineList('user-1', 'list-1', [item]);

    await expect(cache.loadOfflineList('user-1', 'list-1')).resolves.toEqual([item]);
  });

  it('isolates users and clears only the signing-out user snapshots', async () => {
    const cache = createOfflineCache(new MemoryIdbFactory() as unknown as IDBFactory);
    await cache.saveOfflineList('user-1', 'list-1', [item]);
    await cache.saveOfflineList('user-2', 'list-1', [{ ...item, id: 'item-2', createdBy: 'user-2', updatedBy: 'user-2' }]);

    await cache.clearOfflineLists('user-1');

    await expect(cache.loadOfflineList('user-1', 'list-1')).resolves.toBeNull();
    await expect(cache.loadOfflineList('user-2', 'list-1')).resolves.toEqual([{ ...item, id: 'item-2', createdBy: 'user-2', updatedBy: 'user-2' }]);
  });

  it('does not save a stale snapshot after that user has signed out', async () => {
    const cache = createOfflineCache(new MemoryIdbFactory() as unknown as IDBFactory);

    await cache.clearOfflineLists('user-1');
    await cache.saveOfflineList('user-1', 'list-1', [item]);

    await expect(cache.loadOfflineList('user-1', 'list-1')).resolves.toBeNull();
  });

  it('clears existing snapshots even when a pending write fails during logout', async () => {
    const factory = new MemoryIdbFactory();
    const cache = createOfflineCache(factory as unknown as IDBFactory);
    await cache.saveOfflineList('user-1', 'list-1', [item]);
    factory.failNextPut(new Error('Cuota agotada'));
    const failedWrite = cache.saveOfflineList('user-1', 'list-1', [{ ...item, name: 'Pan' }]);
    const failedWriteExpectation = expect(failedWrite).rejects.toThrow('Cuota agotada');

    await expect(cache.clearOfflineLists('user-1')).resolves.toBeUndefined();
    await failedWriteExpectation;
    await expect(cache.loadOfflineList('user-1', 'list-1')).resolves.toBeNull();
  });

  it('settles request and transaction failures from save, load, and clear', async () => {
    const factory = new MemoryIdbFactory();
    const cache = createOfflineCache(factory as unknown as IDBFactory);

    factory.failNextPut(new Error('Fallo al guardar'));
    await expect(cache.saveOfflineList('user-1', 'list-1', [item])).rejects.toThrow('Fallo al guardar');
    factory.failNextGet(new Error('Fallo al leer'));
    await expect(cache.loadOfflineList('user-1', 'list-1')).rejects.toThrow('Fallo al leer');
    factory.abortNextGetAll(new Error('Transacción abortada'));
    await expect(cache.clearOfflineLists('user-1')).rejects.toThrow('Transacción abortada');
  });
});

class MemoryIdbFactory {
  private readonly records = new Map<string, unknown>();
  private database?: MemoryDatabase;
  private readonly failures: Partial<Record<MemoryOperation, MemoryFailure>> = {};

  failNextPut(error: Error): void { this.failures.put = { error, aborted: false }; }
  failNextGet(error: Error): void { this.failures.get = { error, aborted: false }; }
  abortNextGetAll(error: Error): void { this.failures.getAll = { error, aborted: true }; }

  open(): IDBOpenDBRequest {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => {
      const isNew = !this.database;
      this.database ??= new MemoryDatabase(this.records, (operation) => {
        const failure = this.failures[operation];
        delete this.failures[operation];
        return failure;
      });
      Object.defineProperty(request, 'result', { value: this.database, configurable: true });
      if (isNew) request.onupgradeneeded?.call(request, new Event('upgradeneeded') as IDBVersionChangeEvent);
      request.onsuccess?.call(request, new Event('success'));
    });
    return request;
  }
}

class MemoryDatabase {
  readonly objectStoreNames = { contains: () => true } as unknown as DOMStringList;

  constructor(private readonly records: Map<string, unknown>, private readonly nextFailure: (operation: MemoryOperation) => MemoryFailure | undefined) {}

  createObjectStore(): IDBObjectStore { return new MemoryStore(this.records, this.nextFailure) as unknown as IDBObjectStore; }

  transaction(): IDBTransaction {
    const transaction = new MemoryTransaction(this.records, this.nextFailure);
    setTimeout(() => transaction.complete(), 0);
    return transaction as unknown as IDBTransaction;
  }
}

class MemoryTransaction {
  oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  private failed = false;

  constructor(private readonly records: Map<string, unknown>, private readonly nextFailure: (operation: MemoryOperation) => MemoryFailure | undefined) {}

  objectStore(): IDBObjectStore { return new MemoryStore(this.records, this.nextFailure, this) as unknown as IDBObjectStore; }
  complete(): void {
    if (!this.failed) this.oncomplete?.call(this as unknown as IDBTransaction, new Event('complete'));
  }
  fail(error: Error, aborted: boolean): void {
    queueMicrotask(() => {
      this.failed = true;
      Object.defineProperty(this, 'error', { value: error, configurable: true });
      const event = new Event(aborted ? 'abort' : 'error');
      if (aborted) this.onabort?.call(this as unknown as IDBTransaction, event);
      else this.onerror?.call(this as unknown as IDBTransaction, event);
    });
  }
}

class MemoryStore {
  constructor(private readonly records: Map<string, unknown>, private readonly nextFailure: (operation: MemoryOperation) => MemoryFailure | undefined, private readonly transaction?: MemoryTransaction) {}

  put(value: unknown, key: string): IDBRequest {
    const failure = this.nextFailure('put');
    if (failure) return failedRequest(failure.error, () => this.transaction?.fail(failure.error, failure.aborted));
    this.records.set(key, value);
    return successfulRequest(value);
  }
  get(key: string): IDBRequest {
    const failure = this.nextFailure('get');
    return failure ? failedRequest(failure.error, () => this.transaction?.fail(failure.error, failure.aborted)) : successfulRequest(this.records.get(key));
  }
  getAll(): IDBRequest {
    const failure = this.nextFailure('getAll');
    return failure ? failedRequest(failure.error, () => this.transaction?.fail(failure.error, failure.aborted)) : successfulRequest([...this.records.values()]);
  }
  delete(key: string): IDBRequest { this.records.delete(key); return successfulRequest(undefined); }
}

function successfulRequest(result: unknown): IDBRequest {
  const request = {} as IDBRequest;
  queueMicrotask(() => {
    Object.defineProperty(request, 'result', { value: result, configurable: true });
    request.onsuccess?.call(request, new Event('success'));
  });
  return request;
}

function failedRequest(error: Error, onFailure?: () => void): IDBRequest {
  const request = {} as IDBRequest;
  queueMicrotask(() => {
    Object.defineProperty(request, 'error', { value: error, configurable: true });
    request.onerror?.call(request, new Event('error'));
    onFailure?.();
  });
  return request;
}

type MemoryOperation = 'put' | 'get' | 'getAll';
type MemoryFailure = { error: Error; aborted: boolean };
