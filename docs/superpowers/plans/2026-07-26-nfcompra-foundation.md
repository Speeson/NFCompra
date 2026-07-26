# NFCompra Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un monorepo verificable con Worker/D1, PWA y Android Compose, incluyendo el esquema de datos y pantallas locales de demostración sin exponer mutaciones anónimas.

**Architecture:** `apps/api` será un Worker con un único endpoint público de salud y migraciones D1 completas; no habrá rutas de negocio hasta el hito de autenticación. `apps/web` y `apps/android` renderizarán los mismos estados de lista mediante fixtures locales, separados de sus futuras capas de red y persistencia.

**Tech Stack:** npm workspaces, TypeScript, Cloudflare Workers/Wrangler/D1, Vitest, React, Vite, React Testing Library, vite-plugin-pwa, Kotlin, Jetpack Compose, Material 3, JUnit y Compose UI Test.

## Global Constraints

- Nombre visible de producto: `NFCompra`; dominio web: `https://nfcompra.esgarpe.dev`; API: `https://api.nfcompra.esgarpe.dev`.
- Cada hogar puede tener varias listas y debe tener exactamente una lista predeterminada.
- Todas las fechas se almacenarán como ISO 8601 UTC y los IDs internos serán UUID.
- Ninguna clave, token de firma, secreto JWT ni clave Resend se añadirá a Git.
- Las mutaciones de negocio no se implementan en este hito; más adelante exigirán autenticación, pertenencia y rol cuando corresponda.
- No introducir WebSockets, notificaciones, escáner, voz, IA ni una app iOS nativa.
- Todo cambio de lógica tendrá primero una prueba que falle; cada tarea termina con pruebas y un commit pequeño.

---

## Estructura resultante

| Ruta | Responsabilidad |
| --- | --- |
| `package.json` | Workspace raíz y comandos comunes de API y web. |
| `apps/api/src/index.ts` | Router mínimo del Worker y `GET /health`. |
| `apps/api/migrations/*.sql` | Esquema D1 e índices, incluida la unicidad de lista predeterminada. |
| `apps/api/test/health.test.ts` | Prueba de salud del Worker con D1 local. |
| `apps/web/src/app/App.tsx` | Composición de la PWA de demostración. |
| `apps/web/src/features/shopping-list/*` | Modelos, fixtures y UI pura de listas. |
| `apps/web/src/styles/*` | Tokens y temas accesibles. |
| `apps/android/app` | Punto de entrada Android y navegación de demostración. |
| `apps/android/core/designsystem` | Tema, tokens y componentes Compose reutilizables. |
| `apps/android/feature/shoppinglist` | Estado, fixtures y pantalla pura de lista. |

### Task 1: Crear la base del monorepo

**Files:**
- Create: `AGENTS.md`, `.editorconfig`, `.gitignore`, `package.json`, `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/wrangler.jsonc`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `README.md`.
- Modify: ninguna ruta existente salvo el `README.md` mínimo.
- Test: `apps/api/test/health.test.ts` y `apps/web/src/app/App.test.tsx` se crearán en tareas posteriores.

**Interfaces:**
- Produces: los comandos raíz `npm run api:test`, `npm run web:test`, `npm run api:dev` y `npm run web:dev`.
- Produces: los manifests y la configuración base que la Tarea 2 usará para declarar `Env` y el binding D1.

- [ ] **Step 1: Crear la estructura de carpetas y los manifests sin dependencias de producción adicionales**

```text
apps/api/{src,migrations,test}
apps/web/{public,src/app,src/features/shopping-list,src/styles}
apps/android/{app,core/designsystem,feature/shoppinglist}
docs/{architecture.md,api-contract.md,nfc-and-app-links.md,deployment.md}
```

- [ ] **Step 2: Configurar el workspace npm y los comandos de cada aplicación**

```json
{
  "name": "nfcompra",
  "private": true,
  "workspaces": ["apps/api", "apps/web"],
  "scripts": {
    "api:test": "npm --workspace @nfcompra/api run test",
    "web:test": "npm --workspace @nfcompra/web run test",
    "api:dev": "npm --workspace @nfcompra/api run dev",
    "web:dev": "npm --workspace @nfcompra/web run dev"
  }
}
```

- [ ] **Step 3: Configurar la exclusión de secretos y los finales de línea**

```gitignore
node_modules/
dist/
.wrangler/
.dev.vars
.env*
!.env.example
local.properties
*.jks
*.keystore
```

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

- [ ] **Step 4: Documentar los prerrequisitos y los comandos reproducibles**

El `README.md` debe indicar Node LTS, npm, Wrangler autenticado, Android Studio/JDK 17 y los comandos `npm install`, `npm run api:dev`, `npm run web:dev`, `npm run api:test`, `npm run web:test` y `./gradlew test` desde `apps/android`.

- [ ] **Step 5: Verificar los manifests antes de añadir código**

Run: `npm install`

Expected: termina sin crear archivos de secretos y genera el lockfile en la raíz.

- [ ] **Step 6: Commit**

```bash
git add .editorconfig .gitignore package.json package-lock.json README.md apps/api/package.json apps/api/tsconfig.json apps/api/wrangler.jsonc apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts docs
git commit -m "chore: initialize NFCompra workspace"
```

### Task 2: Implementar Worker, D1 y el contrato de salud

**Files:**
- Create: `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/src/shared/http.ts`, `apps/api/migrations/0001_initial_schema.sql`, `apps/api/migrations/0002_indexes.sql`, `apps/api/test/health.test.ts`, `apps/api/vitest.config.ts`.
- Modify: `apps/api/package.json`, `apps/api/wrangler.jsonc`.
- Test: `apps/api/test/health.test.ts`.

**Interfaces:**
- Produces: `export interface Env { DB: D1Database; JWT_SECRET: string; RESEND_API_KEY: string; APP_BASE_URL: string; ALLOWED_ORIGINS: string }`.
- Produces: Worker handler `fetch(request: Request, env: Env): Promise<Response>`.
- Produces: `GET /health` con estado `200` y cuerpo `{ "status": "ok" }`.

- [ ] **Step 1: Escribir la prueba de salud que falla**

```ts
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src';

it('returns an operational health response', async () => {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request('http://local/health'), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla por falta del módulo**

Run: `npm --workspace @nfcompra/api run test -- health.test.ts`

Expected: FAIL indicando que `../src` no existe o no exporta el Worker.

- [ ] **Step 3: Escribir las dos migraciones D1**

`0001_initial_schema.sql` debe crear exactamente `users`, `auth_tokens`, `refresh_tokens`, `households`, `household_members`, `invitations`, `shopping_lists`, `shopping_items`, `nfc_links` y `sync_operations`, con las columnas definidas en `nfcompra_codex_plan.md`. `nfc_links` contiene `household_id` pero no `list_id`: el NFC abre siempre la lista predeterminada del hogar.

`0002_indexes.sql` debe crear los índices del documento base y la garantía de una sola lista predeterminada:

```sql
CREATE UNIQUE INDEX idx_shopping_lists_one_default_per_household
  ON shopping_lists(household_id)
  WHERE is_default = 1;
```

- [ ] **Step 4: Implementar el mínimo Worker y binding local D1**

```ts
const worker: ExportedHandler<Env> = {
  async fetch(request) {
    if (new URL(request.url).pathname === '/health' && request.method === 'GET') {
      return Response.json({ status: 'ok' });
    }
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.', details: {} } }, { status: 404 });
  },
};

export default worker;
```

En `wrangler.jsonc`, declarar `main: "src/index.ts"`, compatibilidad actual, binding `DB` para D1 y valores no secretos locales para `APP_BASE_URL` y `ALLOWED_ORIGINS`; `JWT_SECRET` y `RESEND_API_KEY` se configuran solo mediante `.dev.vars`/secrets.

- [ ] **Step 5: Añadir una prueba de integración que consulta D1**

Extender `health.test.ts` con:

```ts
it('can query the local D1 binding after migrations', async () => {
  const result = await env.DB.prepare('SELECT 1 AS value').first<{ value: number }>();
  expect(result).toEqual({ value: 1 });
});
```

- [ ] **Step 6: Ejecutar la migración y todas las pruebas API**

Run: `npm --workspace @nfcompra/api run db:migrate:local && npm --workspace @nfcompra/api run test`

Expected: ambas pruebas pasan y Wrangler aplica `0001_initial_schema.sql` y `0002_indexes.sql` a D1 local.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): configure worker and D1 schema"
```

### Task 3: Construir la PWA visual con fixtures locales

**Files:**
- Create: `apps/web/src/main.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/app/App.test.tsx`, `apps/web/src/features/shopping-list/model.ts`, `apps/web/src/features/shopping-list/fixtures.ts`, `apps/web/src/features/shopping-list/ShoppingListScreen.tsx`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/global.css`, `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/icon-192.png`, `apps/web/public/icons/icon-512.png`.
- Modify: `apps/web/package.json`, `apps/web/vite.config.ts`.
- Test: `apps/web/src/app/App.test.tsx`.

**Interfaces:**
- Produces: `type ShoppingItem = { id: string; name: string; quantity: number; unit?: string; isChecked: boolean }`.
- Produces: `ShoppingListScreen({ title, items, isOffline }: { title: string; items: ShoppingItem[]; isOffline: boolean }): JSX.Element`.
- Produces: fixture `demoShoppingItems: ShoppingItem[]`.

- [ ] **Step 1: Escribir pruebas de estados visuales que fallen**

```tsx
it('separates pending and checked items', () => {
  render(<ShoppingListScreen title="Mercadona" items={demoShoppingItems} isOffline={false} />);
  expect(screen.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Comprados' })).toBeVisible();
  expect(screen.getByText('Leche')).toBeVisible();
});

it('shows the offline notice', () => {
  render(<ShoppingListScreen title="Mercadona" items={[]} isOffline />);
  expect(screen.getByText('Sin conexión')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar las pruebas para confirmar que fallan**

Run: `npm --workspace @nfcompra/web run test -- App.test.tsx`

Expected: FAIL porque no existen `ShoppingListScreen` ni `demoShoppingItems`.

- [ ] **Step 3: Implementar modelos, fixtures y pantalla sin llamadas HTTP**

```ts
export const demoShoppingItems: ShoppingItem[] = [
  { id: '1', name: 'Leche', quantity: 2, unit: 'l', isChecked: false },
  { id: '2', name: 'Pan integral', quantity: 1, isChecked: true },
];
```

La pantalla debe usar elementos semánticos: un `h1` con el nombre de lista, secciones `Pendientes` y `Comprados`, botones con etiqueta accesible para añadir y marcar, un estado vacío y un aviso visible de conexión. Los botones no mutan datos todavía.

- [ ] **Step 4: Configurar tokens, tema y manifest PWA**

Definir variables CSS de color, espaciado, radios y foco visible en `tokens.css`; usar `prefers-color-scheme` para tema oscuro. Configurar `vite-plugin-pwa` con nombre `NFCompra`, `start_url: "/"`, `display: "standalone"`, iconos 192/512 y caché del shell de compilación.

- [ ] **Step 5: Ejecutar pruebas, chequeo de tipos y build web**

Run: `npm --workspace @nfcompra/web run test && npm --workspace @nfcompra/web run typecheck && npm --workspace @nfcompra/web run build`

Expected: todas las pruebas pasan y `dist/` contiene el manifiesto y el service worker generado.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add NFCompra PWA foundation"
```

### Task 4: Crear la base visual Android Compose con fixtures

**Files:**
- Create: `apps/android/settings.gradle.kts`, `apps/android/build.gradle.kts`, `apps/android/app/build.gradle.kts`, `apps/android/app/src/main/AndroidManifest.xml`, `apps/android/app/src/main/java/dev/esgarpe/nfcompra/MainActivity.kt`, `apps/android/core/designsystem/src/main/java/dev/esgarpe/nfcompra/core/designsystem/NFCompraTheme.kt`, `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListUiState.kt`, `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreen.kt`, `apps/android/feature/shoppinglist/src/test/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListUiStateTest.kt`, `apps/android/feature/shoppinglist/src/androidTest/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreenTest.kt`.
- Modify: ninguna ruta Android existente.
- Test: `ShoppingListUiStateTest.kt`, `ShoppingListScreenTest.kt`.

**Interfaces:**
- Produces: Android `applicationId = "dev.esgarpe.nfcompra"` y nombre `NFCompra`.
- Produces: `data class ShoppingListItemUiModel(val id: String, val name: String, val quantity: String, val checked: Boolean)`.
- Produces: `data class ShoppingListUiState(val title: String, val pending: List<ShoppingListItemUiModel>, val checked: List<ShoppingListItemUiModel>, val isOffline: Boolean)`.
- Produces: `@Composable fun ShoppingListScreen(state: ShoppingListUiState, onAction: (ShoppingListAction) -> Unit)`.

- [ ] **Step 1: Generar el proyecto Gradle modular y escribir la prueba de estado que falla**

```kotlin
class ShoppingListUiStateTest {
  @Test fun `demo list has pending and checked products`() {
    val state = demoShoppingListUiState()
    assertEquals(1, state.pending.size)
    assertEquals(1, state.checked.size)
  }
}
```

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `./gradlew :feature:shoppinglist:testDebugUnitTest`

Expected: FAIL porque `demoShoppingListUiState` y los modelos no existen.

- [ ] **Step 3: Implementar estado inmutable, acciones y fixture local**

```kotlin
sealed interface ShoppingListAction {
  data class ToggleItem(val id: String) : ShoppingListAction
  data object AddItem : ShoppingListAction
  data object SelectList : ShoppingListAction
}
```

Crear `demoShoppingListUiState()` con Leche pendiente y Pan integral comprado. Ninguna acción persiste ni accede a red en este hito.

- [ ] **Step 4: Escribir la prueba Compose que falla para los estados principales**

```kotlin
composeTestRule.setContent {
  NFCompraTheme { ShoppingListScreen(demoShoppingListUiState(isOffline = true), {}) }
}
composeTestRule.onNodeWithText("Pendientes").assertExists()
composeTestRule.onNodeWithText("Comprados").assertExists()
composeTestRule.onNodeWithText("Sin conexión").assertExists()
```

- [ ] **Step 5: Implementar tema, pantalla pura y previews**

`NFCompraTheme` debe proporcionar esquemas claro y oscuro Material 3. La pantalla debe tener encabezado con título, secciones pendientes/comprados, aviso offline, estado vacío y botones con `contentDescription`. Añadir previews para claro, oscuro, vacío, cargando/error simulado, tamaño de fuente aumentado y listas con datos.

- [ ] **Step 6: Ejecutar pruebas y ensamblar el APK de depuración**

Run: `./gradlew :feature:shoppinglist:testDebugUnitTest :feature:shoppinglist:connectedDebugAndroidTest :app:assembleDebug`

Expected: las pruebas unitarias y Compose pasan; Gradle genera `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 7: Commit**

```bash
git add apps/android
git commit -m "feat(android): add Compose foundation"
```

## Revisión del plan

- Cobertura: este plan cubre el Hito 1 del diseño: monorepo, Worker/D1 y migraciones, PWA visual y Android visual. Autenticación, API de negocio, D1 real desde clientes, correo, sincronización, NFC, CI y despliegues quedan deliberadamente para sus propios hitos.
- Seguridad: no existe una ruta de mutación sin autenticación; web y Android emplean fixtures locales hasta que se implemente el flujo de sesión.
- Consistencia: los modelos de lista son de demostración y no se comparten entre plataformas; el contrato real se definirá primero en API antes de conectar clientes.
