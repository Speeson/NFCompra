# NFCompra Online MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir las pantallas de ejemplo en un MVP online para una persona: registro, hogar creado manualmente, varias listas y productos reales desde web y Android.

**Architecture:** Cloudflare Worker/D1 concentra autenticación, permisos y datos. PWA y Android consumen el contrato `/v1`; web usa access token en memoria y refresh cookie `HttpOnly`, Android guarda tokens con Keystore. No se incluye compartición, NFC, offline ni despliegue.

**Tech Stack:** TypeScript, Workers/D1/Web Crypto, Resend, React/Vite/TanStack Query, Kotlin/Compose/Hilt/Retrofit/OkHttp/DataStore, Vitest, MockWebServer y Turbine.

## Global Constraints

- Nombre `NFCompra`; web `https://nfcompra.esgarpe.dev`; API `https://api.nfcompra.esgarpe.dev`.
- No hacer push, PR, release ni despliegue sin autorización explícita.
- IDs UUID, fechas ISO 8601 UTC y errores JSON con `error.code`, `error.message` y `error.details`.
- Refresh tokens persistidos solo como hashes; PWA usa cookie `HttpOnly`, `Secure`, `SameSite=Lax` del host API.
- El usuario crea manualmente un hogar; al crearlo se crea una lista predeterminada. Puede añadir listas, pero solo una tiene `is_default = 1`.
- Cada mutación valida sesión y pertenencia. No implementar invitaciones, NFC, offline, Room, WorkManager, WebSockets ni despliegues.
- Aplicar TDD: prueba roja, implementación mínima, prueba verde y commit local por tarea.

---

## Orden y dependencias

1. API de autenticación y correo verificable.
2. API de hogares, listas y productos; depende de 1.
3. Sesión y autenticación PWA; depende de 1.
4. PWA conectada a hogares/listas; depende de 2 y 3.
5. Sesión y autenticación Android; depende de 1.
6. Android conectado a hogares/listas; depende de 2 y 5.

### Task 1: Autenticación API y correo verificable

**Files:**

- Create: `apps/api/src/auth/{password-hasher,token-service,auth-repository,routes}.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/email/{email-sender,resend-email-sender}.ts`, `apps/api/test/auth.integration.test.ts`.
- Modify: `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/package.json`.

**Produces:** `POST /v1/auth/register|verify-email|login|refresh|logout|forgot-password|reset-password`; `GET/PATCH /v1/me`; `requireUser(request, env): Promise<AuthUser>`.

- [ ] Write the failing test for unverified login.

```ts
expect(response.status).toBe(403);
expect(await response.json()).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
```

- [ ] Run `npm --workspace @nfcompra/api run test -- auth.integration.test.ts` and confirm it fails because auth routes do not exist.
- [ ] Implement PBKDF2 password hashing, 256-bit random tokens, SHA-256 persisted token hashes, 15-minute access JWT and 30-day revocable refresh tokens.
- [ ] Implement `EmailSender`; tests use a fake sender and assert recipient, subject and verification/reset URL.
- [ ] For `clientType: "web"`, set refresh cookie; for `clientType: "android"`, return refresh token JSON. Access token is JSON for both.
- [ ] Run `npm --workspace @nfcompra/api run test` and `npx tsc --project apps/api/tsconfig.json`; expect all pass.
- [ ] Commit locally: `git commit -m "feat(api): add verified authentication"`.

### Task 2: API de hogares, listas y productos

**Files:**

- Create: `apps/api/src/households/{routes,repository}.ts`, `apps/api/src/lists/{routes,repository,validation}.ts`, `apps/api/test/shopping-lists.integration.test.ts`.
- Modify: `apps/api/src/index.ts`.

**Produces:** `POST/GET /v1/households`; `POST/GET /v1/households/:householdId/lists`; item CRUD under `/v1/lists/:listId/items` and `/v1/items/:itemId`.

- [ ] Write the failing test that `POST /v1/households` returns a default list in the same response.
- [ ] Run `npm --workspace @nfcompra/api run test -- shopping-lists.integration.test.ts`; expect route-missing failure.
- [ ] Implement D1 repositories and authorization. Household creation inserts owner membership and exactly one default list in a single D1 batch.
- [ ] Implement item creation, edit, check, delete, checked-item purge, normalized search and `operationId` idempotency. `PATCH` requires `expectedVersion` and returns `409 ITEM_VERSION_CONFLICT` with current resource.
- [ ] Run the complete API suite; cover a foreign user, conflict, duplicate operation and several lists in one household.
- [ ] Commit locally: `git commit -m "feat(api): add personal households and shopping lists"`.

### Task 3: Sesión y autenticación de la PWA

**Files:**

- Create: `apps/web/src/api/{client,session}.ts`, `apps/web/src/features/auth/{AuthProvider,LoginPage,RegisterPage,auth.test}.tsx`.
- Modify: `apps/web/src/{app/App,main}.tsx`, `apps/web/package.json`.

**Produces:** `ApiClient.request<T>()`, `SessionContext`, rutas `/register`, `/login`, `/auth/verify`, `/auth/reset-password` y aplicación protegida.

- [ ] Write failing login test that displays API invalid-credentials error.
- [ ] Implement fetch with `credentials: 'include'`, access token in memory and one refresh retry after `401`; never store refresh token in localStorage.
- [ ] Implement register, login, verify, forgot/reset password and logout screens with accessible labels.
- [ ] Run `npm --workspace @nfcompra/web run test`, `typecheck` and `build`; expect all pass.
- [ ] Commit locally: `git commit -m "feat(web): add authentication session"`.

### Task 4: PWA conectada a hogares, listas y productos

**Files:**

- Create: `apps/web/src/features/households/HouseholdSetup.tsx`, `apps/web/src/features/shopping-list/{queries,ShoppingListRoute,ShoppingListRoute.test}.tsx`.
- Modify: `apps/web/src/features/shopping-list/ShoppingListScreen.tsx`, `apps/web/src/app/App.tsx`.

**Produces:** selector de hogar/lista, alta manual de hogar/lista y mutaciones optimistas de productos mediante TanStack Query.

- [ ] Write failing test where a failed toggle restores the previous checked state and shows `No se pudo guardar el cambio.`
- [ ] Implement setup screen for a user with no household, selectors and CRUD product UI. Refresh visible list every 15 seconds.
- [ ] On `409`, display the current server item and a retry action. Do not add offline mutation persistence.
- [ ] Run `npm --workspace @nfcompra/web run test && npm --workspace @nfcompra/web run build`; expect all pass.
- [ ] Commit locally: `git commit -m "feat(web): connect shopping lists"`.

### Task 5: Sesión y autenticación Android

**Files:**

- Create: `apps/android/core/network/*`, `apps/android/feature/auth/*` and unit tests under `feature/auth/src/test`.
- Modify: `apps/android/{settings.gradle.kts,app/build.gradle.kts}`, `MainActivity.kt`.

**Produces:** `AuthRepository.login(email, password): Flow<AuthResult>`, secure `TokenStore`, `BearerInterceptor`, one-retry `RefreshAuthenticator` and auth Compose routes.

- [ ] Write MockWebServer/Turbine test asserting successful login persists access and refresh tokens.
- [ ] Run `cd apps/android; .\gradlew.bat :feature:auth:testDebugUnitTest`; expect missing-module failure.
- [ ] Implement Retrofit/OkHttp, Keystore-backed token store, auth repository/ViewModels and login/register/verification/reset screens.
- [ ] Run `cd apps/android; .\gradlew.bat :feature:auth:testDebugUnitTest :app:assembleDebug`; expect pass.
- [ ] Commit locally: `git commit -m "feat(android): add authentication session"`.

### Task 6: Android conectado a hogares, listas y productos

**Files:**

- Create: `apps/android/feature/shoppinglist/*Repository.kt`, `*ViewModel.kt`, `*Api.kt` and tests under `feature/shoppinglist/src/test`.
- Modify: `ShoppingListScreen.kt`, `MainActivity.kt`.

**Produces:** `ShoppingListRepository.observeItems(listId): Flow<List<ShoppingListItemUiModel>>` and ViewModel loading/error/data states.

- [ ] Write failing Turbine test asserting `Loading` then populated `Data` after MockWebServer response.
- [ ] Implement Retrofit API access, household/list selectors and online item CRUD. Show network and `409` conflict errors; do not cache or queue operations.
- [ ] Run `cd apps/android; .\gradlew.bat :feature:shoppinglist:testDebugUnitTest :app:assembleDebug`; expect pass.
- [ ] Commit locally: `git commit -m "feat(android): connect online shopping lists"`.

## Review

- This plan covers a one-person online MVP. It deliberately defers shared members/invitations, Android offline-first behavior, NFC, CI and all deployment work.
- Each task has an independent test gate and local commit. The user must explicitly authorize future remote deployments or GitHub operations.
