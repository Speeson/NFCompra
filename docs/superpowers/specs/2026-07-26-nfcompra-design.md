# NFCompra — Diseño del MVP

## Propósito

NFCompra es una lista de la compra compartida. Una misma cuenta puede pertenecer a varios hogares y cada hogar puede mantener varias listas, por ejemplo una por supermercado. Android se distribuye como APK desde GitHub Releases; iPhone y ordenador usan una PWA. Un sticker NFC abre de forma segura el hogar al que está asociado.

## Arquitectura

El repositorio es un monorepo con tres aplicaciones independientes:

- `apps/api`: Cloudflare Worker en TypeScript. Es la única capa con acceso a Cloudflare D1 y Resend. Aplica autenticación, autorización, idempotencia y control de versiones.
- `apps/web`: React, Vite y PWA desplegada en Vercel en `https://nfcompra.esgarpe.dev`.
- `apps/android`: aplicación Kotlin/Jetpack Compose distribuida como APK. Usa Room, WorkManager y almacenamiento seguro de tokens.

La API se publica en `https://api.nfcompra.esgarpe.dev`. Los clientes no comparten código de ejecución y consumen el mismo contrato HTTP versionado bajo `/v1`.

## Sesiones y seguridad

La PWA mantiene un access token de corta vida solo en memoria. El refresh token es una cookie `HttpOnly`, `Secure` y `SameSite=Lax` emitida por `api.nfcompra.esgarpe.dev`; las solicitudes web incluyen credenciales y el Worker permite únicamente el origen web configurado. Android conserva sus tokens de refresh con una abstracción respaldada por Android Keystore.

Las contraseñas y todos los tokens persistidos se guardan como hashes. Las mutaciones exigen autenticación, pertenencia al hogar y, cuando corresponde, rol `owner`. Los UUID son internos; los códigos NFC son aleatorios, revocables y no secuenciales. Fechas e identificadores de operación se intercambian como ISO 8601 UTC y UUID respectivamente.

## Hogares y listas

Al crear un hogar se crea, en la misma operación lógica, una primera lista marcada como predeterminada. Un hogar puede crear listas adicionales para supermercados o propósitos distintos y debe tener exactamente una lista predeterminada, garantizada por un índice único parcial en D1.

Todos los miembros pueden consultar y editar las listas de su hogar. El propietario administra el hogar, miembros, invitaciones y enlaces NFC. Cambiar el hogar o la lista seleccionada es una acción explícita en web y Android. La eliminación de miembros, invitaciones y demás operaciones de administración se valida siempre en API.

## Productos y sincronización

Los productos pertenecen a una lista y contienen nombre, cantidad, unidad, categoría, nota, estado de compra, posición y versión. Las mutaciones incluyen `expectedVersion` y `operationId`. Un conflicto devuelve `409 ITEM_VERSION_CONFLICT` junto con el recurso vigente; el cliente ofrece recuperar el estado o reintentar.

La PWA actualiza optimistamente y refresca la lista visible cada 15 segundos. Guarda la última lista obtenida para consulta sin conexión y desactiva mutaciones cuando no hay red. Android escribe primero en Room, encola la operación y WorkManager la sincroniza por orden al recuperar conectividad. La idempotencia del Worker evita duplicados durante reintentos.

## NFC y App Links

Cada sticker guarda una URL HTTPS con el formato `https://nfcompra.esgarpe.dev/nfc/:publicCode`. El código resuelve exclusivamente un hogar; no concede acceso ni incluye datos sensibles. Al escanear:

1. Si Android está instalado, Android App Links abre NFCompra. En caso contrario se abre la PWA.
2. Si no hay sesión, el cliente solicita inicio de sesión y conserva la ruta de continuación.
3. La API comprueba la pertenencia al hogar del enlace.
4. Si existe pertenencia, se abre la lista predeterminada de ese hogar. Si no existe, se muestra acceso denegado sin revelar ningún dato del hogar.

El propietario puede crear, listar y revocar enlaces NFC de su hogar. La aplicación muestra la URL para grabarla como registro URL/NDEF. La web publica `/.well-known/assetlinks.json` sin redirecciones para verificar App Links.

## Entregas y despliegue

La implementación se divide en cinco hitos: prototipo local, MVP autenticado para un usuario, compartición y offline, NFC/distribución, y estabilización. API y D1 se despliegan en Cloudflare; la PWA se despliega en Vercel; un tag Git produce APK firmado y los assets `nfcompra-<version>.apk` y `nfcompra-latest.apk` en GitHub Releases.

## Pruebas y criterios de calidad

Se aplicará TDD al dominio, API, repositorios y ViewModels. Web usa Vitest, React Testing Library y Playwright. Android usa JUnit, Turbine, MockWebServer, Room y Compose UI Test. CI valida lint, tipos, pruebas y compilaciones separadas de API, web y Android.

El MVP excluye WebSockets, notificaciones push, código de barras, voz, IA, precios, geolocalización y una aplicación iOS nativa.
