# NFCompra

NFCompra es un MVP online para una persona. Incluye una API local con Worker/D1, una PWA y una aplicacion Android; los tres clientes usan el contrato `/v1`. No hay servicios desplegados.

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
.\gradlew.bat :core:database:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

El APK queda en `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

## Funcionalidad actual

- La API permite registro, verificacion y reenvio de verificacion de correo, inicio y cierre de sesion, renovacion, recuperacion y restablecimiento de contrasena, y consulta y edicion de perfil. Las pruebas usan un remitente falso; no se documentan claves ni se verifica el envio de correo real.
- Una persona puede crear varios hogares manualmente; cada hogar obtiene una lista predeterminada y puede tener listas adicionales. Las mutaciones de productos requieren autenticacion y cubren alta, edicion, marcado, borrado, purga, busqueda normalizada y conflictos de version. Un `operationId` completado reproduce su respuesta y una operacion pendiente devuelve `409 OPERATION_IN_PROGRESS`.
- Los propietarios de un hogar pueden crear, renovar, listar y revocar invitaciones en `/v1/households/:householdId/invitations`, y eliminar miembros. Cualquier miembro del hogar puede consultar `/v1/households/:householdId/members`. Las invitaciones se aceptan mediante `POST /v1/invitations/accept` o, desde una notificación, `POST /v1/invitations/:invitationId/accept`; ambas rutas requieren la cuenta verificada destinataria. Caducan a los siete dias y los tokens se guardan solo como hashes.
- Hito 3A: la API persiste notificaciones internas en `/v1/notifications`: lista reciente, contador de no leídas, marcado individual y marcado total. Las invitaciones, altas y bajas de miembros y cambios remotos de productos notifican solo a las otras personas afectadas; la actividad de una lista se agrupa por destinatario, autor, lista y tipo durante cinco minutos. No incluye notificaciones push.
- La PWA tiene rutas de registro, acceso, verificacion, reenvio, recuperacion, restablecimiento y cierre de sesion. Conserva el token de acceso en memoria y la API gestiona la cookie de renovacion. Permite seleccionar hogares y listas, crear hogares/listas y gestionar productos; consulta la lista visible cada 15 segundos y aplica mutaciones optimistas con reintento ante conflictos.
- Hito 3B (PWA): guarda en IndexedDB la ultima respuesta correcta de cada lista por usuario autenticado. Si falla la consulta sin conexion, muestra solo esa instantanea de usuario y lista en modo lectura; respuestas tardias de otra fuente no cambian ese estado. Una respuesta correcta posterior sustituye la instantanea y devuelve los controles a su modo conectado. Deshabilita las mutaciones y borra las instantaneas del usuario al cerrar sesion. No almacena tokens ni datos de invitaciones, ni encola mutaciones offline.
- Los propietarios administran miembros e invitaciones desde el hogar seleccionado. La ruta `/invitations/accept?token=...` conserva su continuación de inicio de sesión en `sessionStorage`, muestra errores de aceptación sin datos ajenos y abre el hogar aceptado. La cabecera autenticada incluye notificaciones con contador, lectura individual o total y navegación al hogar o lista relacionada; consulta actualizaciones solo mientras el documento está visible.
- La PWA conserva un aviso de error de lectura de notificaciones tras una navegacion contextual y permite cerrarlo; una solicitud de hogar/lista en URL se aplica una sola vez para no bloquear la seleccion manual posterior.
- Android ofrece las pantallas de autenticacion y conserva los tokens de sesion y renovacion mediante Android Keystore. La pantalla autenticada permite seleccionar y gestionar hogares, listas y productos, con estados de carga, error y datos, y reintento ante conflictos.
- Hito 3B (Android offline-first): Room conserva hogares, listas, productos y operaciones pendientes en una base aislada por cuenta; los tokens continúan en Android Keystore y no se guardan en la base. Cada mutación local añade una operación persistente y agenda trabajo único de WorkManager restringido a `NetworkType.CONNECTED`. El Worker procesa una operación cada vez por orden de creación, conserva su `operationId` durante reintentos y aplica backoff exponencial ante fallos temporales. Una respuesta correcta actualiza el producto y elimina solo su operación dentro de una transacción Room; las altas reconcilian atómicamente el ID temporal, las versiones y la proyección de las operaciones posteriores. Los errores 422, `OPERATION_ID_REUSED`, `OPERATION_LOST` y otros 409 no recuperables quedan como `failed`, visibles como revisión manual, y no bloquean las operaciones siguientes; solo `OPERATION_IN_PROGRESS` reintenta el mismo UUID. `409 ITEM_VERSION_CONFLICT` conserva la versión del servidor sin descartar la intención local. La pantalla compara nombre, versión y, para toggles, estado comprado/pendiente, y permite «Usar versión del servidor» o «Reintentar mi cambio»; el reintento crea una operación nueva con otro UUID y la versión vigente del servidor. Las filas `syncing` interrumpidas se reanudan con el UUID almacenado. Cada Worker rechaza credenciales de otra cuenta y usa un cliente Bearer de solo lectura: un `401` queda reintentable sin consumir ni rotar el refresh token de la sesión interactiva. Las sesiones simultáneas de una cuenta comparten la base y cerrar una no cancela el trabajo único mientras exista otro repositorio; cerrar el último cancela la cadena aunque un Worker mantenga abierta su referencia a Room.
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
