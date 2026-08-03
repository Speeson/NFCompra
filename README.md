# NFCompra

NFCompra es un MVP online para una persona. Incluye una API Worker/D1, una PWA y una aplicacion Android; los tres clientes usan el contrato `/v1`. La API productiva verificada vive en `https://api.nfcompra.esgarpe.dev`.

## Requisitos

- Node.js LTS y npm.
- Android Studio, JDK 21 y Android SDK disponible mediante `ANDROID_HOME` para compilar Android.

## Desarrollo local

Instala las dependencias desde la raiz:

```sh
npm install
```

Inicia la API local en un terminal:

```sh
npm run api:dev
```

Inicia la PWA en otro terminal:

```sh
npm run web:dev
```

El servidor de desarrollo de la PWA reenvia `/v1` a `http://localhost:8787`, por lo que las rutas autenticadas y las listas usan la API local. `GET /health` responde `200` con `{ "status": "ok" }` en la API local.

Para preparar un catalogo propio desde un JSON local de productos:

```sh
cd apps/api
npm run catalog:build-sql -- ../../catalogo-productos.json ../../catalog-import.sql
npx wrangler d1 execute DB --local --file ../../catalog-import.sql
```

El repositorio incluye dos seeds sin acentos ni mojibake:

- `apps/api/catalog/supermercados-espana.seed.json`: base propia inicial.
- `apps/api/catalog/mercadona.seed.json`: catalogo publico Mercadona transformado desde el dataset MIT `datania/mercadona-catalog`, con 4.358 productos, 26 categorias principales y 2.840 aliases.

Para cargar un seed en la D1 local:

```sh
cd apps/api
npm run catalog:build-sql -- catalog/supermercados-espana.seed.json catalog/supermercados-espana.seed.sql
npx wrangler d1 execute DB --local --file catalog/supermercados-espana.seed.sql
```

Para D1 remoto, genera el SQL sin transaccion SQL explicita:

```sh
cd apps/api
npm run catalog:build-sql -- catalog/supermercados-espana.seed.json catalog/supermercados-espana.seed.sql --no-transaction
npx wrangler d1 execute nfcompra-production --remote --config wrangler.production.jsonc --file catalog/supermercados-espana.seed.sql
```

Para regenerar el seed Mercadona desde un snapshot local del dataset:

```sh
cd apps/api
npm run catalog:build-mercadona -- catalog/mercadona.seed.json --dataset-dir ../../.tmp/mercadona-catalog
```

El importador acepta campos genericos como `name`, `category`, `brand`, `packageSize`, `sourceProductId` y `aliases`. Tambien reconoce exportaciones JSON con `results[]`, `display_name`, `category_name` y `price_instructions.unit_size`. No descarga imagenes ni precios. Antes de generar SQL, repara mojibake comun y guarda texto visible sin acentos.

La variante `debug` de Android usa `http://10.0.2.2:8787/` como base de API para el emulador. Se puede sustituir mediante la propiedad de Gradle `NFCompraApiBaseUrl` o la variable de entorno `NFCOMPRA_API_BASE_URL`.

## Verificacion

Desde la raiz, para la API:

```sh
npm run api:test && npx --workspace @nfcompra/api tsc --noEmit
```

Para la PWA:

```sh
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
```

Desde `apps/android`, con `ANDROID_HOME` apuntando al SDK instalado, para las pruebas unitarias de la base Room, autenticacion, listas y colaboracion, la compilacion de las pruebas Compose y el APK de depuracion:

```sh
.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

El APK queda en `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

## Funcionalidad actual

- La API permite registro, verificacion y reenvio de verificacion de correo, inicio y cierre de sesion, renovacion, recuperacion y restablecimiento de contrasena, y consulta y edicion de perfil. El registro acepta nombre, apellidos, fecha de nacimiento, username, email y password; la contrasena se guarda solo como hash. Los correos de verificacion y recuperacion se envian con HTML de marca, boton principal y enlace manual, sin mostrar un bloque de token independiente. Las pruebas usan un remitente falso; no se documentan claves ni se verifica el envio de correo real.
- D1 incluye la base del catalogo de productos de supermercado con `product_categories`, `product_catalog` y `product_aliases`, ademas de la referencia opcional `shopping_items.catalog_product_id`. La base productiva verificada incluye 4.386 productos, 38 categorias y 2.872 aliases, sin acentos ni mojibake en nombres visibles. La API expone `GET /v1/product-categories`, `GET /v1/product-catalog?search=...`, `GET /v1/product-catalog/version` y `GET /v1/product-catalog/snapshot`. La PWA descarga el snapshot compacto una vez, lo mantiene en memoria y filtra localmente para autocompletado; si el snapshot falla, conserva la busqueda remota como fallback. El mismo contrato queda preparado para cache local en Android con Room. El repositorio no incluye scraping en directo.
- Una persona puede crear varios hogares manualmente; cada hogar obtiene una lista predeterminada y puede tener listas adicionales. Las mutaciones de productos requieren autenticacion y cubren alta, edicion, marcado, borrado, purga, busqueda normalizada y conflictos de version. Un `operationId` completado reproduce su respuesta y una operacion pendiente devuelve `409 OPERATION_IN_PROGRESS`.
- Los propietarios de un hogar pueden crear, renovar, listar y revocar invitaciones en `/v1/households/:householdId/invitations`, y eliminar miembros. Cualquier miembro del hogar puede consultar `/v1/households/:householdId/members`. Las invitaciones se aceptan mediante `POST /v1/invitations/accept` o, desde una notificación, `POST /v1/invitations/:invitationId/accept`; ambas rutas requieren la cuenta verificada destinataria. Caducan a los siete dias y los tokens se guardan solo como hashes.
- Hito 3A: la API persiste notificaciones internas en `/v1/notifications`: lista reciente, contador de no leídas, marcado individual y marcado total. Las invitaciones, altas y bajas de miembros y cambios remotos de productos notifican solo a las otras personas afectadas; la actividad de una lista se agrupa por destinatario, autor, lista y tipo durante cinco minutos. No incluye notificaciones push.
- La PWA muestra una landing publica en `/` para visitantes anonimos, con modales accesibles para iniciar sesion y crear cuenta. El formulario de registro web recoge nombre, apellidos, fecha de nacimiento, username, email, password y confirmacion de password. Las rutas directas de registro, inicio de sesion, verificacion, reenvio, recuperacion, restablecimiento e invitaciones se mantienen mediante fallback SPA en Vercel. La pagina de verificacion permite verificar, ir a inicio de sesion y copiar el enlace completo de verificacion con un boton de icono. La landing ofrece accesos diferenciados para iniciar sesion y registrarse, y comunica que cada pegatina NFC abre el hogar al que esta vinculada. Conserva el token de acceso en memoria y la API gestiona la cookie de renovacion. Permite seleccionar hogares y listas, crear hogares/listas y gestionar productos; al escribir un producto usa el snapshot local del catalogo para autocompletar en modo lista o en modo tarjetas. El modo tarjetas muestra iconos genericos por producto, controles de cantidad desde cero, una bandeja temporal de pendientes de anadir y eliminacion previa con boton o gesto de deslizar. La lista y la cuadricula de resultados se cierran al pulsar fuera y se reabren al enfocar de nuevo el campo Producto manteniendo la busqueda escrita. Consulta la lista visible cada 15 segundos y aplica mutaciones optimistas con reintento ante conflictos.
- Hito 3B (PWA): guarda en IndexedDB la ultima respuesta correcta de cada lista por usuario autenticado. Si falla la consulta sin conexion, muestra solo esa instantanea de usuario y lista en modo lectura; respuestas tardias de otra fuente no cambian ese estado. Una respuesta correcta posterior sustituye la instantanea y devuelve los controles a su modo conectado. Deshabilita las mutaciones y borra las instantaneas del usuario al cerrar sesion. No almacena tokens ni datos de invitaciones, ni encola mutaciones offline.
- Los propietarios administran miembros e invitaciones desde el hogar seleccionado. La ruta `/invitations/accept?token=...` conserva su continuación de inicio de sesión en `sessionStorage`, muestra errores de aceptación sin datos ajenos y abre el hogar aceptado. La cabecera autenticada incluye notificaciones con contador, lectura individual o total y navegación al hogar o lista relacionada; consulta actualizaciones solo mientras el documento está visible.
- La PWA conserva un aviso de error de lectura de notificaciones tras una navegacion contextual y permite cerrarlo; una solicitud de hogar/lista en URL se aplica una sola vez para no bloquear la seleccion manual posterior.
- La PWA autenticada usa una cabecera responsive con marca NFCompra, navegacion principal, notificaciones, menu de perfil accesible y un control de descarga de APK deshabilitado hasta tener una URL real de release.
- La ruta autenticada `/` muestra un panel de hogares con recuentos de miembros, listas, pendientes y progreso, actividad reciente y accesos para crear hogares/listas o abrir NFC.
- La PWA autenticada incluye `/households`, `/households/:id`, `/lists`, `/lists/:id`, `/nfc`, `/profile` y `/settings`. Los detalles de hogar mantienen la gestion de miembros e invitaciones; los detalles de lista reutilizan la experiencia offline y optimista existente.
- La PWA autenticada muestra cabeceras y tarjetas compactas para hogares y listas; la pantalla de lista centra el nombre de la lista, coloca el cambio lista/tarjetas arriba a la derecha, integra la creacion de producto en la cabecera con control `- cantidad +`, separa pendientes y comprados, y usa controles cuadrados para marcar, editar y eliminar productos. El modo edicion de producto mantiene solo nombre y cantidad, sin unidad, con un stepper compacto coloreado segun pendiente o comprado, y acciones explicitas para guardar o cancelar.
- Android ofrece las pantallas de autenticacion y conserva los tokens de sesion y renovacion mediante Android Keystore. La pantalla autenticada permite seleccionar y gestionar hogares, listas y productos, con estados de carga, error y datos, y reintento ante conflictos.
- Hito 3B (Android offline-first): Room conserva hogares, listas, productos y operaciones pendientes en una base aislada por cuenta; los tokens continúan en Android Keystore y no se guardan en la base. Las instancias del almacén de tokens de un mismo proceso comparten coordinación y generación de sesión, por lo que una operación demorada de una actividad anterior no sustituye ni borra una sesión más reciente. En un arranque con instantánea Room, la pantalla muestra hogares, listas y productos cacheados antes de esperar la actualización HTTP; una lectura cacheada tardía de un contexto anterior tampoco sustituye el hogar o la lista abiertos después. Cada mutación local añade una operación persistente y agenda trabajo único de WorkManager restringido a `NetworkType.CONNECTED`. El Worker procesa una operación cada vez por orden de creación, conserva su `operationId` durante reintentos y aplica backoff exponencial ante fallos temporales. Una respuesta correcta actualiza el producto y elimina solo su operación dentro de una transacción Room; las altas reconcilian atómicamente el ID temporal, las versiones y la proyección de las operaciones posteriores. Los errores 422, `OPERATION_ID_REUSED`, `OPERATION_LOST` y otros 409 no recuperables quedan como `failed`, visibles como revisión manual, y no bloquean las operaciones siguientes; solo `OPERATION_IN_PROGRESS` reintenta el mismo UUID. `409 ITEM_VERSION_CONFLICT` conserva la versión del servidor sin descartar la intención local. La pantalla compara nombre, versión y, para toggles, estado comprado/pendiente, y permite «Usar versión del servidor» o «Reintentar mi cambio»; el reintento crea una operación nueva con otro UUID y la versión vigente del servidor. Las filas `syncing` interrumpidas se reanudan con el UUID almacenado. Cada Worker rechaza credenciales de otra cuenta y usa un cliente Bearer de solo lectura: un `401` queda reintentable sin consumir ni rotar el refresh token de la sesión interactiva. Cerrar o recrear la interfaz libera sus colectores y su referencia a Room sin cancelar la cola; el cierre de sesión, el cambio de cuenta o la revocación detienen y esperan las operaciones del repositorio antes de cancelar por última vez el trabajo único de la cuenta anterior.
- Hito 3B (integración): las regresiones cubren iniciar con datos cacheados de Room, ordenar dos mutaciones de producto offline en un único ciclo de sincronización y resolver un conflicto de versión de forma explícita.
- Android permite abrir los miembros del hogar seleccionado, invita, revoca y elimina miembros solo desde controles de propietario con confirmacion, y muestra el contenido en solo lectura al resto. La sesion autenticada incluye una campana accesible con contador, lectura individual o total y navegacion al hogar o lista exactos; consulta notificaciones cada 15 segundos mientras la actividad esta reanudada y la sesion sigue autenticada. Un fallo al marcar una notificacion no bloquea la navegacion y muestra un aviso cerrable; una lectura correcta refresca la lista y el contador.
- Android acepta tanto `https://nfcompra.esgarpe.dev/invitations/accept?token=...`, que coincide con el enlace publico de correo previsto, como `nfcompra://app/invitations/accept?token=...`. El filtro HTTPS no declara verificacion de App Links, por lo que Android puede mostrar su selector. El token pendiente se conserva solo mediante el estado de instancia de la actividad durante una recreacion y se elimina al aceptar o cancelar; no se guarda en preferencias ni se registra. No se habilitan push ni NFC; el único trabajo en segundo plano es la sincronización de la cola offline mediante WorkManager.

## Limites del MVP

- No hay despliegue ni operaciones remotas incluidas.
- La PWA no encola ni sincroniza mutaciones offline. Android limita su cola offline a mutaciones de productos y no añade rutas HTTP nuevas. NFC, WebSockets y notificaciones push quedan fuera de este alcance.

## Estructura

- `apps/api`: Worker local, migraciones D1 y contrato `/v1`.
- `apps/web`: PWA React con autenticacion y listas conectadas a la API local.
- `apps/android`: aplicacion Compose con autenticacion, listas respaldadas por Room y API configurada para `debug`.
- `docs`: diseno, arquitectura, contrato versionado de API y plan del MVP.
