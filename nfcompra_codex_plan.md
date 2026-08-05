# NFCompra — Plan de implementación para Codex

> **Para Codex:** ejecuta este plan tarea por tarea. No avances a la siguiente tarea hasta que las pruebas de la actual pasen y el cambio haya quedado registrado en un commit pequeño y descriptivo.

**Objetivo:** construir una aplicación de lista de la compra compartida con una app Android nativa y una PWA para iPhone/ordenador, ambas conectadas a una API en Cloudflare Workers y una base de datos Cloudflare D1. Cada sticker NFC estará vinculado a un hogar: abrirá la app Android cuando esté instalada y, en caso contrario, abrirá la PWA, que ofrecerá la descarga del APK desde GitHub Releases.

**Nombre de la aplicación:** NFCompra

**Arquitectura:** monorepo con tres aplicaciones independientes: API, web/PWA y Android. La API es la única capa que accede a D1 y Resend. Los clientes comparten contratos conceptuales, pero no código de ejecución. La sincronización inicial será mediante actualización optimista y refresco periódico mientras la lista esté visible; WebSockets quedan fuera del MVP.

**Tecnologías:**
- API: TypeScript, Cloudflare Workers, D1, Wrangler y API Fetch nativa.
- Web/PWA: React, TypeScript, Vite, React Router, TanStack Query y `vite-plugin-pwa`.
- Android: Kotlin, Jetpack Compose, Material 3, Navigation Compose, Hilt, Retrofit/OkHttp, Room, DataStore y WorkManager.
- Correo: Resend.
- Distribución: Vercel para la PWA; Cloudflare para Worker/D1; GitHub Releases para el APK.
- Pruebas: Vitest, React Testing Library, Playwright, JUnit, Turbine, MockWebServer y Compose UI Test.

## Restricciones globales

- El proyecto debe poder utilizarse sin pagar Google Play ni Apple Developer.
- Android se distribuye mediante un APK firmado publicado en GitHub Releases.
- iPhone y ordenador utilizan la PWA; no se crea una app iOS nativa en el MVP.
- El sticker NFC almacena una URL HTTPS, nunca credenciales ni tokens permanentes.
- URL principal: `https://nfcompra.esgarpe.dev`.
- URL de API: `https://api.nfcompra.esgarpe.dev`.
- Las URLs NFC usan el patrón `https://nfcompra.esgarpe.dev/nfc/:publicCode`.
- El dominio de App Links debe servir `/.well-known/assetlinks.json` por HTTPS, sin redirecciones.
- Las claves de firma, JWT y Resend no se guardan en Git.
- Toda mutación debe validar que el usuario pertenece al hogar y tiene permiso.
- Todas las fechas se guardan en UTC en formato ISO 8601.
- Los IDs internos serán UUID.
- Los códigos públicos NFC serán aleatorios, revocables y no secuenciales.
- No introducir WebSockets, notificaciones push, escaneo de códigos de barras ni reconocimiento de voz durante el MVP.
- Usar TDD en dominio, API, repositorios y ViewModels. Las pantallas visuales requieren pruebas de componentes para sus estados principales.

---

# 1. Alcance funcional del MVP

## Autenticación

- Registro con nombre, correo y contraseña.
- Verificación obligatoria del correo mediante Resend.
- Inicio de sesión.
- Renovación de sesión mediante refresh token.
- Cierre de sesión en el dispositivo actual.
- Solicitud de recuperación de contraseña.
- Restablecimiento mediante token de un solo uso.
- Consulta y edición básica del perfil.
- Pantalla que permite reenviar el correo de verificación.

## Hogares y listas

- Crear un hogar.
- Al crear un hogar, crear su lista de la compra predeterminada.
- Cada hogar puede tener varias listas para distintos supermercados o propósitos; una de ellas siempre es la predeterminada.
- Invitar a otra persona mediante correo.
- Aceptar invitación desde web o Android.
- Roles: `owner` y `member`.
- Ver los hogares a los que pertenece el usuario.
- Cambiar entre hogares y entre las listas de un mismo hogar.
- Crear y renombrar listas.
- El propietario puede eliminar miembros; no puede eliminarse a sí mismo sin transferir o eliminar el hogar.

## Productos

- Añadir producto.
- Campos: nombre, cantidad, unidad opcional, categoría opcional y nota opcional.
- Marcar y desmarcar como comprado.
- Editar producto.
- Eliminar producto.
- Separar visualmente pendientes y comprados.
- Vaciar solo los productos comprados.
- Buscar productos por nombre.
- Mantener un catálogo local de nombres usados recientemente para autocompletado.
- Actualización optimista con recuperación del estado anterior si la API falla.

## NFC y enlaces

- Cada sticker abre `https://nfcompra.esgarpe.dev/nfc/:publicCode`, con un código asociado a un hogar.
- Android instalado: abre NFCompra mediante Android App Links.
- Android no instalado: abre la PWA y muestra un botón de descarga.
- iPhone: abre la PWA.
- Escritorio: abre la web.
- Tras iniciar sesión, `/nfc/:publicCode` abre la lista predeterminada del hogar vinculado, aunque este tenga otras listas.
- Si el usuario no pertenece al hogar vinculado, la ruta muestra que no tiene acceso y no revela los datos de la lista.
- El propietario crea y revoca los códigos NFC de su hogar desde la aplicación antes de grabarlos en el sticker.

## PWA

- Instalable desde el navegador.
- Manifest con nombre, iconos y color de tema.
- Service worker para guardar el shell visual.
- La primera versión permite consultar la última lista almacenada sin conexión.
- Las mutaciones sin conexión se incorporan en una fase posterior; el MVP debe mostrar claramente “Sin conexión” y desactivar acciones que requieran red.
- Diseño responsive móvil y escritorio.

## Android

- Interfaz íntegra en Jetpack Compose.
- Previews para modo claro, oscuro, lista vacía, cargando, error y lista con productos.
- Caché local con Room.
- La lista cacheada puede consultarse sin conexión.
- Las operaciones realizadas sin conexión se almacenan en una cola local y WorkManager intenta sincronizarlas cuando vuelve la conectividad.
- DataStore conserva preferencias no sensibles.
- Los tokens se guardan cifrados usando Android Keystore mediante una abstracción de almacenamiento seguro.

---

# 2. Modelo de datos D1

Crear migraciones SQL ordenadas en `apps/api/migrations`.

## Tabla `users`

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `email TEXT NOT NULL UNIQUE COLLATE NOCASE`
- `password_hash TEXT NOT NULL`
- `email_verified_at TEXT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

## Tabla `auth_tokens`

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL`
- `type TEXT NOT NULL CHECK(type IN ('email_verification','password_reset'))`
- `token_hash TEXT NOT NULL UNIQUE`
- `expires_at TEXT NOT NULL`
- `used_at TEXT NULL`
- `created_at TEXT NOT NULL`
- FK hacia `users(id)` con borrado en cascada.
- Índice por `user_id`, `type` y `expires_at`.

## Tabla `refresh_tokens`

- `id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL`
- `token_hash TEXT NOT NULL UNIQUE`
- `device_name TEXT NULL`
- `expires_at TEXT NOT NULL`
- `revoked_at TEXT NULL`
- `created_at TEXT NOT NULL`
- FK hacia `users(id)` con borrado en cascada.
- Índice por `user_id` y `expires_at`.

## Tabla `households`

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `owner_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

## Tabla `household_members`

- `household_id TEXT NOT NULL`
- `user_id TEXT NOT NULL`
- `role TEXT NOT NULL CHECK(role IN ('owner','member'))`
- `created_at TEXT NOT NULL`
- PK compuesta `(household_id, user_id)`.

## Tabla `invitations`

- `id TEXT PRIMARY KEY`
- `household_id TEXT NOT NULL`
- `email TEXT NOT NULL COLLATE NOCASE`
- `invited_by TEXT NOT NULL`
- `token_hash TEXT NOT NULL UNIQUE`
- `expires_at TEXT NOT NULL`
- `accepted_at TEXT NULL`
- `created_at TEXT NOT NULL`
- Índice por `email` y `expires_at`.

## Tabla `shopping_lists`

- `id TEXT PRIMARY KEY`
- `household_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `is_default INTEGER NOT NULL DEFAULT 0`
- `version INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- Índice por `household_id`.
- Índice único parcial por `household_id` donde `is_default = 1`, para garantizar una sola lista predeterminada por hogar.

## Tabla `shopping_items`

- `id TEXT PRIMARY KEY`
- `list_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `normalized_name TEXT NOT NULL`
- `quantity REAL NOT NULL DEFAULT 1`
- `unit TEXT NULL`
- `category TEXT NULL`
- `note TEXT NULL`
- `is_checked INTEGER NOT NULL DEFAULT 0`
- `position INTEGER NOT NULL DEFAULT 0`
- `version INTEGER NOT NULL DEFAULT 1`
- `created_by TEXT NOT NULL`
- `updated_by TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- Índices por `list_id`, `(list_id, is_checked)` y `(list_id, normalized_name)`.

## Tabla `nfc_links`

- `id TEXT PRIMARY KEY`
- `public_code TEXT NOT NULL UNIQUE`
- `household_id TEXT NOT NULL`
- `is_active INTEGER NOT NULL DEFAULT 1`
- `created_by TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

## Tabla `sync_operations`

Solo se utilizará si se decide mantener un registro de idempotencia en servidor:

- `operation_id TEXT PRIMARY KEY`
- `user_id TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `response_status INTEGER NOT NULL`
- `response_body TEXT NULL`
- El servidor conservará estos registros durante siete días.

---

# 3. Contrato HTTP inicial

Todas las respuestas usan JSON. Los errores siguen:

```json
{
  "error": {
    "code": "ITEM_VERSION_CONFLICT",
    "message": "El producto ha cambiado en otro dispositivo.",
    "details": {}
  }
}
```

## Autenticación

- `POST /v1/auth/register`
- `POST /v1/auth/verify-email`
- `POST /v1/auth/resend-verification`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`
- `POST /v1/auth/forgot-password`
- `POST /v1/auth/reset-password`
- `GET /v1/me`
- `PATCH /v1/me`

## Hogares

- `GET /v1/households`
- `POST /v1/households`
- `GET /v1/households/:householdId`
- `PATCH /v1/households/:householdId`
- `DELETE /v1/households/:householdId`
- `GET /v1/households/:householdId/members`
- `DELETE /v1/households/:householdId/members/:userId`
- `POST /v1/households/:householdId/invitations`
- `POST /v1/invitations/accept`

## Listas y productos

- `GET /v1/households/:householdId/lists`
- `POST /v1/households/:householdId/lists`
- `GET /v1/lists/:listId`
- `PATCH /v1/lists/:listId`
- `GET /v1/lists/:listId/items`
- `POST /v1/lists/:listId/items`
- `PATCH /v1/items/:itemId`
- `DELETE /v1/items/:itemId`
- `DELETE /v1/lists/:listId/items/checked`

Las mutaciones aceptan `operationId` para que un reintento de Android no duplique la operación.

Para editar un producto:

```json
{
  "expectedVersion": 3,
  "operationId": "uuid",
  "name": "Leche",
  "quantity": 2,
  "unit": "litros",
  "category": "Lácteos",
  "note": null,
  "isChecked": false
}
```

Si la versión no coincide, devolver `409 ITEM_VERSION_CONFLICT` junto con el recurso actual.

## NFC

- `GET /v1/nfc/:publicCode`
- `POST /v1/households/:householdId/nfc-links`
- `PATCH /v1/nfc-links/:nfcLinkId`
- `DELETE /v1/nfc-links/:nfcLinkId`

---

# 4. Estructura del repositorio

```text
nfcompra/
├── .github/
│   └── workflows/
│       ├── api-ci.yml
│       ├── web-ci.yml
│       ├── android-ci.yml
│       ├── deploy-api.yml
│       └── release-android.yml
├── apps/
│   ├── api/
│   │   ├── migrations/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── households/
│   │   │   ├── lists/
│   │   │   ├── nfc/
│   │   │   ├── email/
│   │   │   ├── middleware/
│   │   │   ├── db/
│   │   │   ├── shared/
│   │   │   └── index.ts
│   │   ├── test/
│   │   ├── wrangler.jsonc
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/
│   │   ├── public/
│   │   │   ├── .well-known/
│   │   │   │   └── assetlinks.json
│   │   │   ├── icons/
│   │   │   └── manifest.webmanifest
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── households/
│   │   │   │   ├── shopping-list/
│   │   │   │   └── nfc/
│   │   │   ├── components/
│   │   │   ├── api/
│   │   │   └── styles/
│   │   ├── vercel.json
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── android/
│       ├── app/
│       ├── core/
│       │   ├── common/
│       │   ├── database/
│       │   ├── network/
│       │   ├── designsystem/
│       │   └── testing/
│       ├── feature/
│       │   ├── auth/
│       │   ├── households/
│       │   ├── shoppinglist/
│       │   ├── nfc/
│       │   └── settings/
│       ├── build-logic/
│       ├── gradle/
│       └── settings.gradle.kts
├── docs/
│   ├── architecture.md
│   ├── api-contract.md
│   ├── nfc-and-app-links.md
│   └── deployment.md
├── .editorconfig
├── .gitignore
└── README.md
```

---

# 5. Plan de tareas

## Tarea 1 — Inicializar el monorepo y la documentación

**Entrega verificable:** los tres proyectos compilan de forma independiente y existe documentación de ejecución local.

- [ ] Crear la estructura raíz.
- [ ] Inicializar Worker TypeScript en `apps/api`.
- [ ] Inicializar React + TypeScript + Vite en `apps/web`.
- [ ] Crear proyecto Android Compose modular en `apps/android`.
- [ ] Configurar `.editorconfig`, `.gitignore` y convenciones de commits.
- [ ] Crear `README.md` con comandos exactos de API, web y Android.
- [ ] Añadir un test mínimo por proyecto y ejecutarlo.
- [ ] Commit: `chore: initialize NFCompra monorepo`.

## Tarea 2 — Configurar Worker, D1 y migraciones

**Entrega verificable:** `GET /health` responde y una prueba de integración lee D1 local.

- [ ] Definir el tipo `Env` con binding `DB`, `JWT_SECRET`, `RESEND_API_KEY`, `APP_BASE_URL` y `ALLOWED_ORIGINS`.
- [ ] Configurar `wrangler.jsonc` para entornos local y producción.
- [ ] Crear migración `0001_initial_schema.sql` con las tablas del apartado 2.
- [ ] Crear migración `0002_indexes.sql`.
- [ ] Implementar utilidades de fechas, UUID y normalización de correo/producto.
- [ ] Implementar `GET /health`.
- [ ] Crear prueba que aplica migraciones y consulta `SELECT 1`.
- [ ] Commit: `feat(api): configure worker and D1 schema`.

## Tarea 3 — Implementar el núcleo de autenticación

**Entrega verificable:** registro, verificación, login, refresh y logout pasan pruebas de integración.

- [ ] Crear `PasswordHasher` sobre Web Crypto; separar interfaz e implementación.
- [ ] Crear generador de tokens aleatorios con al menos 256 bits.
- [ ] Guardar únicamente hashes de tokens de verificación, recuperación y refresh.
- [ ] Crear access token de vida corta y refresh token revocable.
- [ ] Validar correo normalizado, nombre y contraseña.
- [ ] Implementar repositorios D1 de usuarios y tokens.
- [ ] Implementar los endpoints de registro, verificación, login, refresh y logout.
- [ ] Invalidar tokens usados o caducados.
- [ ] Añadir middleware de autenticación Bearer.
- [ ] Probar credenciales inválidas, usuario no verificado, token expirado, token usado y refresh revocado.
- [ ] Commit: `feat(api): add secure authentication flow`.

## Tarea 4 — Integrar Resend

**Entrega verificable:** el API genera y envía correos con enlaces correctos usando un cliente simulado en tests.

- [ ] Crear interfaz `EmailSender`.
- [ ] Crear implementación `ResendEmailSender`.
- [ ] Crear plantillas HTML y texto plano para:
  - verificación de cuenta;
  - recuperación de contraseña;
  - invitación a un hogar.
- [ ] Usar URLs:
  - `https://nfcompra.esgarpe.dev/auth/verify?token=...`
  - `https://nfcompra.esgarpe.dev/auth/reset-password?token=...`
  - `https://nfcompra.esgarpe.dev/invitations/accept?token=...`
- [ ] Añadir reenvío de verificación con invalidación de tokens anteriores.
- [ ] Añadir recuperación y restablecimiento de contraseña.
- [ ] Evitar revelar si un correo existe en el endpoint de recuperación.
- [ ] Probar destinatario, asunto, URL y expiración del token.
- [ ] Commit: `feat(api): send transactional emails with Resend`.

## Tarea 5 — Implementar hogares, miembros e invitaciones

**Entrega verificable:** dos usuarios verificados pueden compartir un hogar mediante invitación.

- [ ] Crear un hogar y su lista predeterminada dentro de una única operación lógica.
- [ ] Implementar autorización por pertenencia y rol.
- [ ] Implementar consulta y edición de hogares.
- [ ] Implementar invitaciones con token de un solo uso.
- [ ] Al aceptar, crear `household_members` y marcar la invitación.
- [ ] Evitar invitar a un miembro existente.
- [ ] Permitir al propietario eliminar miembros.
- [ ] Probar accesos cruzados entre hogares y operaciones de propietario.
- [ ] Commit: `feat(api): add shared households and invitations`.

## Tarea 6 — Implementar listas y productos

**Entrega verificable:** las operaciones CRUD y los conflictos de versión funcionan.

- [ ] Implementar repositorios de listas y productos.
- [ ] Implementar validación de pertenencia en todas las rutas.
- [ ] Permitir crear varias listas por hogar y garantizar una única lista predeterminada por hogar.
- [ ] Crear producto con versión `1`.
- [ ] Editar mediante `expectedVersion`.
- [ ] Incrementar versión y `updated_at` en cada cambio.
- [ ] Devolver `409` cuando exista conflicto.
- [ ] Implementar borrado individual y borrado de comprados.
- [ ] Implementar búsqueda por nombre normalizado.
- [ ] Implementar idempotencia mediante `operationId`.
- [ ] Probar reintentos, conflictos, usuario ajeno y vaciado de comprados.
- [ ] Commit: `feat(api): add collaborative shopping lists`.

## Tarea 7 — Construir el diseño visual web

**Entrega verificable:** Storybook no es necesario; los estados principales se ven en rutas de desarrollo y tienen pruebas de componentes.

- [ ] Definir tokens: color, tipografía, espaciado, radios y elevación.
- [ ] Crear componentes:
  - botón primario/secundario;
  - campo de texto;
  - diálogo;
  - tarjeta de producto;
  - selector de cantidad;
  - estado vacío;
  - aviso de error;
  - indicador de conexión.
- [ ] Crear temas claro y oscuro.
- [ ] Crear páginas de auth, hogares, lista, miembros y ajustes.
- [ ] Probar estados vacío, carga, error, offline y lista poblada.
- [ ] Aplicar accesibilidad: etiquetas, foco visible, contraste y navegación por teclado.
- [ ] Commit: `feat(web): add responsive NFCompra design system`.

## Tarea 8 — Implementar autenticación web y PWA

**Entrega verificable:** un usuario puede registrarse, verificar, iniciar sesión y recuperar contraseña desde navegador móvil.

- [ ] Crear cliente API tipado.
- [ ] Implementar almacenamiento de sesión evitando guardar refresh tokens en `localStorage`.
- [ ] Elegir cookie segura `HttpOnly` si la arquitectura final permite mismo sitio; en caso contrario, mantener refresh token en memoria y renovar sesión mediante un endpoint seguro específicamente documentado.
- [ ] Implementar rutas de registro, verificación, login, recuperación y reset.
- [ ] Implementar protección de rutas.
- [ ] Crear `manifest.webmanifest`.
- [ ] Configurar service worker para el shell y recursos estáticos.
- [ ] Mostrar estado offline.
- [ ] Añadir tests de componentes y flujo E2E de autenticación.
- [ ] Commit: `feat(web): add authentication and PWA shell`.

## Tarea 9 — Implementar hogares y lista en la PWA

**Entrega verificable:** dos navegadores pueden añadir y marcar productos en la misma lista.

- [ ] Crear selector de hogar.
- [ ] Crear selector de lista dentro del hogar y formulario para crear listas adicionales.
- [ ] Crear y renombrar hogar.
- [ ] Invitar miembro y aceptar invitación.
- [ ] Consultar lista con TanStack Query.
- [ ] Refrescar cada 15 segundos solo mientras la pantalla sea visible.
- [ ] Añadir actualización optimista para alta, edición, marcado y borrado.
- [ ] Revertir cambios si la API falla.
- [ ] Resolver `409` mostrando el recurso actual y permitiendo reintentar.
- [ ] Guardar la última lista exitosa en IndexedDB para consulta offline.
- [ ] Añadir pruebas E2E del flujo compartido.
- [ ] Commit: `feat(web): add collaborative shopping list`.

## Tarea 10 — Crear el sistema visual Android con Compose

**Entrega verificable:** todas las pantallas principales tienen previews y pruebas básicas.

- [ ] Crear tema Material 3 y tokens equivalentes a la PWA.
- [ ] Crear componentes reutilizables.
- [ ] Crear modelos `UiState` y `UiAction` por pantalla.
- [ ] Separar `Route` con ViewModel y `Screen` puramente visual.
- [ ] Añadir previews:
  - claro y oscuro;
  - móvil pequeño y grande;
  - vacío, cargando, error y datos;
  - tamaño de fuente aumentado.
- [ ] Añadir pruebas Compose de componentes críticos.
- [ ] Commit: `feat(android): add Compose design system and screens`.

## Tarea 11 — Implementar red, sesión y autenticación Android

**Entrega verificable:** registro, login, verificación y recuperación funcionan contra un servidor simulado.

- [ ] Configurar Retrofit/OkHttp.
- [ ] Crear interceptor Bearer.
- [ ] Crear `Authenticator` que renueva una vez y evita bucles.
- [ ] Crear almacenamiento seguro de tokens.
- [ ] Implementar repositorios de autenticación.
- [ ] Implementar ViewModels y navegación.
- [ ] Manejar enlaces de verificación, reset e invitación.
- [ ] Probar con MockWebServer y Turbine.
- [ ] Commit: `feat(android): add authentication and secure session`.

## Tarea 12 — Implementar Room y la lista Android offline-first

**Entrega verificable:** la última lista se muestra sin conexión y las operaciones pendientes se sincronizan.

- [ ] Crear entidades Room de hogares, listas, productos y operaciones pendientes.
- [ ] Crear DAOs y migraciones.
- [ ] Definir `PendingOperation` con `operationId`, tipo, payload, intentos y fecha.
- [ ] Al mutar, actualizar Room primero y encolar operación.
- [ ] Crear `SyncWorker` con restricciones de red.
- [ ] Enviar operaciones por orden de creación.
- [ ] Eliminar operación cuando la API confirma.
- [ ] Aplicar backoff en errores temporales.
- [ ] Marcar conflicto cuando la API devuelve `409`.
- [ ] Crear interfaz para resolver conflicto conservando servidor o reintentando cambio local.
- [ ] Probar DAO, cola, reintento, idempotencia y conflicto.
- [ ] Commit: `feat(android): add offline-first shopping list sync`.

## Tarea 13 — Configurar Android App Links y NFC

**Entrega verificable:** abrir la URL desde ADB dirige a la app instalada y la web funciona sin app.

- [ ] Registrar el host `nfcompra.esgarpe.dev` y rutas `/nfc/*`, `/auth/*` e `/invitations/*` en el manifest.
- [ ] Publicar `apps/web/public/.well-known/assetlinks.json`.
- [ ] Incluir huellas SHA-256 de debug y release durante desarrollo; retirar debug de producción si no es necesaria.
- [ ] Crear parser de enlaces probado con URLs válidas, inválidas y códigos inexistentes.
- [ ] Implementar `/nfc/:publicCode`:
  - usuario autenticado y miembro: lista predeterminada del hogar vinculado;
  - usuario sin sesión: login y continuación posterior;
  - usuario sin pertenencia: pantalla de acceso denegado sin datos del hogar;
  - sin app: PWA.
- [ ] Permitir al propietario crear, listar y revocar enlaces NFC de su hogar; cada enlace muestra su URL lista para grabar.
- [ ] Crear pantalla web de descarga Android.
- [ ] Enlazar al asset estable:
  `https://github.com/Speeson/NFCompra/releases/latest/download/nfcompra-latest.apk`
- [ ] Documentar cómo grabar el sticker con NFC Tools como registro URL/NDEF.
- [ ] No bloquear el sticker hasta validar una release real.
- [ ] Commit: `feat: add NFC entry point and Android App Links`.

## Tarea 14 — CI, despliegue y releases

**Entrega verificable:** una etiqueta Git genera el APK y las ramas principales despliegan API y web.

- [ ] `api-ci.yml`: lint, typecheck, tests y migraciones locales.
- [ ] `web-ci.yml`: lint, typecheck, unit tests y build.
- [ ] `android-ci.yml`: lint, unit tests y assembleDebug.
- [ ] `deploy-api.yml`: desplegar Worker tras CI correcto en `main`.
- [ ] Configurar Vercel para desplegar `apps/web`.
- [ ] `release-android.yml`: al crear tag `v*`, compilar APK release firmado.
- [ ] Guardar keystore y contraseñas como GitHub Secrets.
- [ ] Publicar dos assets:
  - `nfcompra-<version>.apk`
  - `nfcompra-latest.apk`
- [ ] Generar checksum SHA-256 y notas de release.
- [ ] Probar instalación limpia y actualización sobre versión anterior.
- [ ] Commit: `ci: automate deployments and Android releases`.

## Tarea 15 — Seguridad, observabilidad y QA final

**Entrega verificable:** checklist de seguridad completada y flujos principales probados en dispositivos reales.

- [ ] Restringir CORS a dominios permitidos.
- [ ] Establecer cabeceras de seguridad en API y PWA.
- [ ] Limitar tamaño de cuerpos JSON.
- [ ] Aplicar límites a endpoints de auth por IP y correo.
- [ ] Redactar tokens, contraseñas y claves en logs.
- [ ] Crear respuestas de error con `requestId`.
- [ ] Crear logs estructurados del Worker.
- [ ] Añadir endpoint de salud sin datos sensibles.
- [ ] Probar:
  - Android con app instalada;
  - Android sin app;
  - iPhone Safari;
  - PWA instalada;
  - pérdida y recuperación de conexión;
  - dos usuarios editando;
  - expiración de sesión;
  - verificación y recuperación;
  - actualización de APK.
- [ ] Crear `docs/release-checklist.md`.
- [ ] Commit: `chore: complete security and release validation`.

---

# 6. Orden recomendado de entregas

## Hito 1 — Prototipo local

Incluye tareas 1, 2, 6 parcialmente, 7 y 10.

Resultado:
- API local.
- Lista sin autenticación para validar UX.
- PWA y Android muestran productos ficticios y permiten editar estado local.
- Diseño visual aprobado antes de profundizar.

## Hito 2 — MVP online de un usuario

Incluye tareas 3, 4, 6, 8, 9 y 11.

Resultado:
- Registro, verificación, login y recuperación.
- Lista real conectada a D1.
- PWA y Android funcionales con una cuenta.

## Hito 3 — Compartición y offline

Incluye tareas 5 y 12.

Resultado:
- Hogares compartidos.
- Invitaciones.
- Android offline-first.
- PWA con consulta offline.

## Hito 4 — NFC y distribución

Incluye tareas 13 y 14.

Resultado:
- Sticker abre Android instalado.
- Sin app, abre la PWA.
- Descarga estable desde GitHub Releases.
- API y web desplegadas.

## Hito 5 — Estabilización

Incluye tarea 15.

Resultado:
- Primera versión utilizable por familia y amigos.

---

# 7. Criterios de aceptación finales

- Un usuario puede registrarse y verificar la cuenta.
- Puede crear un hogar y añadir productos.
- Puede invitar a otro usuario, que ve la misma lista.
- Los cambios aparecen en el otro cliente en un máximo aproximado de 15 segundos mientras ambos están abiertos.
- Android conserva la última lista sin conexión y sincroniza operaciones pendientes al recuperar la red.
- Cada sticker NFC contiene una URL HTTPS NDEF con un código público asociado a un hogar.
- Con Android instalado, esa URL abre directamente la lista predeterminada del hogar vinculado en NFCompra.
- Sin Android instalado, abre la PWA y ofrece el APK.
- En iPhone, abre la PWA y permite añadirla a la pantalla de inicio.
- El APK se descarga desde un enlace estable de GitHub Releases.
- Ninguna clave privada aparece en el repositorio.
- Todas las operaciones sensibles comprueban autenticación, pertenencia y rol.
- Las pruebas automáticas y builds pasan en CI.

---

# 8. Fuera del MVP

No implementar hasta que los criterios anteriores estén completos:

- WebSockets o Durable Objects para sincronización instantánea.
- Notificaciones push.
- Escaneo de códigos de barras.
- Reconocimiento de voz.
- Sugerencias inteligentes o IA.
- Historial completo de compras.
- Presupuesto y precios.
- Geolocalización de supermercados.
- Aplicación iOS nativa.
- Publicación en Google Play o App Store.
- Integración con Alexa.
- Fotografías de productos.

---

# 9. Primer mensaje para iniciar Codex

Copia este mensaje junto con el plan:

> Trabaja en el repositorio siguiendo `nfcompra_codex_plan.md`. Empieza únicamente por la Tarea 1. Antes de modificar archivos, inspecciona el repositorio y explica brevemente cómo adaptarás la tarea a su estado actual. Usa TDD, ejecuta todos los comandos de verificación indicados, no introduzcas funciones de tareas posteriores y termina con un resumen de archivos modificados, pruebas ejecutadas y resultado. No avances a la Tarea 2 hasta que yo revise y apruebe la Tarea 1.
