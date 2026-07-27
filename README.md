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

Desde `apps/android`, para las pruebas unitarias de autenticacion y listas, y el APK de depuracion:

```sh
.\gradlew.bat :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :app:assembleDebug
```

El APK queda en `apps/android/app/build/outputs/apk/debug/app-debug.apk`.

## Funcionalidad actual

- La API permite registro, verificacion y reenvio de verificacion de correo, inicio y cierre de sesion, renovacion, recuperacion y restablecimiento de contrasena, y consulta y edicion de perfil. Las pruebas usan un remitente falso; no se documentan claves ni se verifica el envio de correo real.
- Una persona puede crear varios hogares manualmente; cada hogar obtiene una lista predeterminada y puede tener listas adicionales. Las mutaciones de productos requieren autenticacion y cubren alta, edicion, marcado, borrado, purga, busqueda normalizada y conflictos de version. Un `operationId` completado reproduce su respuesta y una operacion pendiente devuelve `409 OPERATION_IN_PROGRESS`.
- Los propietarios de un hogar pueden crear, renovar, listar y revocar invitaciones en `/v1/households/:householdId/invitations`, y eliminar miembros. Cualquier miembro del hogar puede consultar `/v1/households/:householdId/members`. Las invitaciones se aceptan mediante `POST /v1/invitations/accept` o, desde una notificación, `POST /v1/invitations/:invitationId/accept`; ambas rutas requieren la cuenta verificada destinataria. Caducan a los siete dias y los tokens se guardan solo como hashes.
- La API persiste notificaciones internas en `/v1/notifications`: lista reciente, contador de no leídas, marcado individual y marcado total. Las invitaciones, altas y bajas de miembros y cambios remotos de productos notifican solo a las otras personas afectadas; la actividad de una lista se agrupa por destinatario, autor, lista y tipo durante cinco minutos. No incluye notificaciones push.
- La PWA tiene rutas de registro, acceso, verificacion, reenvio, recuperacion, restablecimiento y cierre de sesion. Conserva el token de acceso en memoria y la API gestiona la cookie de renovacion. Permite seleccionar hogares y listas, crear hogares/listas y gestionar productos; consulta la lista visible cada 15 segundos y aplica mutaciones optimistas con reintento ante conflictos.
- Los propietarios administran miembros e invitaciones desde el hogar seleccionado. La ruta `/invitations/accept?token=...` conserva su continuación de inicio de sesión en `sessionStorage`, muestra errores de aceptación sin datos ajenos y abre el hogar aceptado. La cabecera autenticada incluye notificaciones con contador, lectura individual o total y navegación al hogar o lista relacionada; consulta actualizaciones solo mientras el documento está visible.
- La PWA conserva un aviso de error de lectura de notificaciones tras una navegacion contextual y permite cerrarlo; una solicitud de hogar/lista en URL se aplica una sola vez para no bloquear la seleccion manual posterior.
- Android ofrece las pantallas de autenticacion y conserva los tokens de sesion y renovacion mediante Android Keystore. La pantalla autenticada permite seleccionar y gestionar hogares, listas y productos, con estados de carga, error y datos, y reintento ante conflictos.

## Limites del MVP

- No hay despliegue ni operaciones remotas incluidas.
- No hay persistencia ni cola de mutaciones offline, Room, NFC, WorkManager ni WebSockets.

## Estructura

- `apps/api`: Worker local, migraciones D1 y contrato `/v1`.
- `apps/web`: PWA React con autenticacion y listas conectadas a la API local.
- `apps/android`: aplicacion Compose con autenticacion y listas conectadas a la API configurada para `debug`.
- `docs`: diseno, arquitectura y plan del MVP.
