# NFCompra

Base del monorepo de NFCompra. El cimiento actual contiene los workspaces de la API y la web, junto con la estructura inicial de Android. La API incluye un Worker local, las migraciones D1 iniciales, su prueba de salud y autenticacion local verificable; todavia no hay funcionalidades de compra ni servicios desplegados.

## Prerrequisitos

- Node.js LTS y npm.
- Wrangler instalado para ejecutar la API local de Cloudflare Workers. La autenticacion solo sera necesaria cuando se realicen operaciones remotas autorizadas.
- Android Studio y JDK 21 para el proyecto Android Compose.

## Comandos

Desde la raiz del repositorio:

```sh
npm install
npm run api:dev
npm run web:dev
npm run api:test
npm run web:test
```

Para verificar y compilar la PWA local:

```sh
npm run web:test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
```

Para aplicar el esquema a D1 local y ejecutar las pruebas de la API:

```sh
npm --workspace @nfcompra/api run db:migrate:local
npm run api:test
```

Para ejecutar directamente la suite de la API, incluida la autenticacion:

```sh
npm --workspace @nfcompra/api run test
```

Al iniciar la API local con `npm run api:dev`, `GET /health` responde `200` con `{ "status": "ok" }`. El Worker y D1 se ejecutan unicamente en local: no hay ningun entorno desplegado.

La API local incluye registro, verificacion de correo, inicio de sesion, renovacion y cierre de sesion, solicitud y restablecimiento de contrasena, y consulta y actualizacion de perfil. Tambien permite crear hogares personales con una lista predeterminada, anadir listas y gestionar productos autenticados, incluida la busqueda normalizada y el control de versiones de cada producto. En las mutaciones de productos, un `operationId` ya completado reproduce su respuesta; si la operacion sigue en curso, la API devuelve `409 OPERATION_IN_PROGRESS`. Las pruebas usan un remitente de correo falso: Resend no esta configurado y no se envian correos reales.

La PWA local tiene pruebas, chequeo de tipos y compilacion. Incluye manifest, iconos y service worker generados durante la compilacion; su pantalla usa fixtures locales y no se conecta a la API ni incluye autenticacion. Los comandos de desarrollo no despliegan servicios.

Para verificar la logica de lista y generar el APK Android de depuracion, desde `apps/android`:

```sh
./gradlew :feature:shoppinglist:testDebugUnitTest :app:assembleDebug
```

El APK generado queda en `apps/android/app/build/outputs/apk/debug/app-debug.apk`. La prueba instrumentada de Compose requiere un dispositivo o emulador ADB conectado; no se ejecuto aqui porque no habia ninguno conectado.

## Estructura inicial

- `apps/api`: Worker local de Cloudflare, esquema y migraciones D1, y prueba de salud.
- `apps/web`: PWA local con Vite y React, pantalla de lista de demostracion y fixtures sin backend.
- `apps/android`: aplicacion Compose configurada, modulos de diseno y lista de demostracion con fixtures locales.
- `docs`: diseno, plan de implementacion y documentos de arquitectura.
