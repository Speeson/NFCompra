# NFCompra Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir consulta offline de solo lectura en la PWA y sincronización offline-first de productos en Android.

**Architecture:** La PWA persiste la última instantánea correcta por usuario y lista en IndexedDB y nunca encola mutaciones offline. Android convierte Room en su fuente de verdad: cada mutación actualiza Room y encola una operación idempotente; WorkManager las sincroniza en orden cuando hay red y expone conflictos para resolución explícita.

**Tech Stack:** React/Vite/TanStack Query/Vitest/IndexedDB, Kotlin/Compose/Room/WorkManager/Retrofit/MockWebServer/JUnit.

## Global Constraints

- Trabajar solo en `hito3b`; no hacer push, PR, despliegues ni operaciones remotas sin permiso explícito.
- PWA offline es estrictamente consulta: no mutaciones optimistas, cola ni cambios simulados sin red.
- La caché PWA se separa por usuario y lista y se elimina al cerrar sesión.
- Android mantiene tokens fuera de Room; Room contiene hogares, listas, productos y operaciones pendientes.
- Toda operación pendiente conserva el mismo UUID `operationId` durante sus reintentos y se procesa por orden de creación.
- `409 ITEM_VERSION_CONFLICT` nunca descarta cambios locales automáticamente; se resuelve mediante servidor o reintento explícito.
- No añadir WebSockets, push, NFC, App Links nuevos ni cambios al contrato HTTP existente.
- Tras cada tarea revisada, actualizar README solo con comportamiento y comandos verificados.

---

### Task 1: Caché offline de solo lectura en la PWA

**Files:**
- Create: `apps/web/src/features/shopping-list/offline-cache.ts`
- Create: `apps/web/src/features/shopping-list/offline-cache.test.ts`
- Modify: `apps/web/src/features/shopping-list/ShoppingListRoute.tsx`
- Modify: `apps/web/src/features/shopping-list/ShoppingListRoute.test.tsx`
- Modify: `apps/web/src/features/auth/AuthProvider.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ApiShoppingItem`, `itemQueryKey`, authenticated `currentUserId` and existing list queries.
- Produces: `saveOfflineList(userId, listId, items)`, `loadOfflineList(userId, listId)`, `clearOfflineLists(userId)` and a PWA route that renders cached data with mutations disabled.

- [ ] **Step 1: Write failing IndexedDB and route tests**

Write tests that save/load an item snapshot, prove another user cannot read it, clear only the signing-out user, and simulate a failed list request with `navigator.onLine === false`. Assert cached items render, an accessible “Sin conexión” status appears, and add/toggle/edit/delete controls are disabled. Assert recovery with a successful network response replaces the cache.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm --workspace @nfcompra/web run test -- --run src/features/shopping-list/offline-cache.test.ts src/features/shopping-list/ShoppingListRoute.test.tsx`

Expected: FAIL because the cache module and offline fallback do not exist.

- [ ] **Step 3: Implement a focused IndexedDB adapter**

Use one database `nfcompra-offline`, an object store keyed by `${userId}:${listId}`, and a record `{ userId, listId, savedAt, items }`. Implement:

```ts
export async function saveOfflineList(userId: string, listId: string, items: ApiShoppingItem[]): Promise<void>;
export async function loadOfflineList(userId: string, listId: string): Promise<ApiShoppingItem[] | null>;
export async function clearOfflineLists(userId: string): Promise<void>;
```

Do not store access/refresh tokens or invitation data. Use a small injected `IDBFactory` seam for tests.

- [ ] **Step 4: Integrate cache save, fallback and auth cleanup**

Save only successful non-empty or empty server responses for the current authenticated user/list. On an offline request failure, load the matching snapshot and set an explicit read-only state; do not use a different user/list fallback. Pass `isOffline` and disabled callbacks to `ShoppingListScreen`; prevent mutation functions from executing when offline. Call `clearOfflineLists` during local logout after the session identity is known.

- [ ] **Step 5: Run verification, document and commit**

Run: `npm run web:test && npm --workspace @nfcompra/web run typecheck && npm --workspace @nfcompra/web run build`

Update README with verified PWA cache behaviour and commands. Commit:

```bash
git add apps/web README.md
git commit -m "feat(web): cache shopping lists for offline reading"
```

### Task 2: Base local Room y repositorio offline Android

**Files:**
- Create: `apps/android/core/database/src/main/java/dev/esgarpe/nfcompra/core/database/NfCompraDatabase.kt`
- Create: `apps/android/core/database/src/main/java/dev/esgarpe/nfcompra/core/database/ShoppingDao.kt`
- Create: `apps/android/core/database/src/main/java/dev/esgarpe/nfcompra/core/database/Entities.kt`
- Create: `apps/android/core/database/src/test/java/dev/esgarpe/nfcompra/core/database/ShoppingDaoTest.kt`
- Create: `apps/android/core/database/build.gradle.kts`
- Modify: `apps/android/settings.gradle.kts`
- Modify: `apps/android/feature/shoppinglist/build.gradle.kts`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListRepository.kt`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListViewModel.kt`
- Modify: `README.md`

**Interfaces:**
- Produces: Room entities `LocalHousehold`, `LocalShoppingList`, `LocalShoppingItem`, `PendingOperation`; DAO flows and `OfflineShoppingRepository` whose observed list comes from Room.

- [ ] **Step 1: Write failing DAO/repository tests**

Create in-memory Room tests proving household/list/item replacement is transactional, list observation returns cached items without any network call, and a local create/update/delete changes Room and inserts one pending operation with a UUID, increasing sequence and `pending` state.

- [ ] **Step 2: Run RED**

Run: `cd apps/android; .\gradlew.bat :core:database:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest`

Expected: FAIL because the database module and offline operations do not exist.

- [ ] **Step 3: Add Room entities, DAO and migrations**

Use Room with schema export enabled. `PendingOperation` contains `id`, `operationId`, `type`, `listId`, `itemId`, `payloadJson`, `createdAt`, `attempts`, `state` (`pending|syncing|conflict|failed`) and optional `serverItemJson`. DAO methods atomically upsert server snapshots, query items by list, enqueue operations ordered by `createdAt,id`, and transition/delete operations.

- [ ] **Step 4: Make Room the list source of truth**

Repository refreshes server data into Room, then exposes DAO flows. Online create/update/delete writes local data first and enqueues an operation; it does not wait for the network path introduced in Task 3. Preserve current UI model mapping and expose pending/conflict metadata needed by later UI.

- [ ] **Step 5: Run verification, document and commit**

Run: `cd apps/android; .\gradlew.bat :core:database:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :app:assembleDebug`

Update README with verified Android local-cache scope. Commit:

```bash
git add apps/android README.md
git commit -m "feat(android): add Room shopping cache"
```

### Task 3: Cola WorkManager, sincronización y conflictos Android

**Files:**
- Create: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/SyncWorker.kt`
- Create: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/OperationSynchronizer.kt`
- Create: `apps/android/feature/shoppinglist/src/test/java/dev/esgarpe/nfcompra/feature/shoppinglist/OperationSynchronizerTest.kt`
- Modify: `apps/android/feature/shoppinglist/build.gradle.kts`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListRepository.kt`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListUiState.kt`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListViewModel.kt`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreen.kt`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 2 DAO/PendingOperation and existing `ShoppingListApi` mutation endpoints.
- Produces: `OperationSynchronizer.syncNext(): SyncResult`, `SyncWorker` with `NetworkType.CONNECTED`, and explicit `ResolveConflict.UseServer` / `ResolveConflict.RetryLocal` actions.

- [ ] **Step 1: Write failing synchronizer and ViewModel tests**

With MockWebServer/fake DAO, assert operations execute in creation order using the stored `operationId`; a 2xx updates Room/removes exactly one operation; IO/5xx returns retry; 422 marks failed; 409 stores server item and marks conflict. Add tests for “use server” discarding only that operation and “retry local” creating a new pending operation with `expectedVersion` from the server item.

- [ ] **Step 2: Run RED**

Run: `cd apps/android; .\gradlew.bat :feature:shoppinglist:testDebugUnitTest`

Expected: FAIL because synchronizer, Worker and conflict actions do not exist.

- [ ] **Step 3: Implement ordered synchronization**

Implement one-operation-at-a-time processing. Serialize payloads sufficient for current POST/PATCH/DELETE contract, retaining `operationId` for retries. Map temporary failures to `Result.retry()` and permanent validation to `failed`. On 409 store the current server item with conflict; never silently discard local intent.

- [ ] **Step 4: Schedule WorkManager and render resolution UI**

Enqueue unique work with `NetworkType.CONNECTED` after a local mutation and after network recovery. Render pending/syncing/failed/conflict state in the shopping screen. Conflict UI must describe both versions and expose labelled buttons “Usar versión del servidor” and “Reintentar mi cambio”; the latter creates a new operation rather than mutating the conflicted one.

- [ ] **Step 5: Run verification, document and commit**

Run: `cd apps/android; .\gradlew.bat :feature:shoppinglist:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :app:assembleDebug`

Update README with verified sync/conflict behaviour and commands. Commit:

```bash
git add apps/android README.md
git commit -m "feat(android): sync offline shopping operations"
```

### Task 4: Integración y verificación Hito 3B

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Create: `docs/superpowers/sdd/2026-07-27-nfcompra-offline/progress.md`

- [ ] **Step 1: Add a regression test for the acceptance flows**

Add one web test for cached data after a failed request and recovery, plus Android test coverage that starts with cached Room data, queues two operations offline, synchronizes them once in order and resolves one conflict explicitly.

- [ ] **Step 2: Run focused tests**

Run: `npm --workspace @nfcompra/web run test -- --run src/features/shopping-list/ShoppingListRoute.test.tsx` and `cd apps/android; .\gradlew.bat :feature:shoppinglist:testDebugUnitTest`.

Expected: PASS only when Tasks 1–3 are integrated.

- [ ] **Step 3: Document verified boundaries**

Update architecture and README to state PWA read-only offline and Android Room/WorkManager queue/conflict behaviour. Keep API contract unchanged except documenting that the existing idempotency/version contract is consumed by Android sync. Do not document secrets or deployments.

- [ ] **Step 4: Run all verification and commit**

Run API, web test/typecheck/build, then:

```powershell
cd apps/android
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :core:database:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :app:assembleDebug
```

Run `git diff --check`, create the tracked progress document, and commit:

```bash
git add README.md docs
git commit -m "docs: finalize Hito 3B offline guide"
```
