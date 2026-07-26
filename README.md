# NFCompra

Base del monorepo de NFCompra. El cimiento actual contiene los workspaces de la API y la web, junto con la estructura inicial de Android. La API incluye un Worker local, las migraciones D1 iniciales y su prueba de salud; todavia no hay funcionalidades de compra ni servicios desplegados.

## Prerrequisitos

- Node.js LTS y npm.
- Wrangler instalado para ejecutar la API local de Cloudflare Workers. La autenticacion solo sera necesaria cuando se realicen operaciones remotas autorizadas.
- Android Studio y JDK 17 para el futuro proyecto Android.

## Comandos

Desde la raiz del repositorio:

```sh
npm install
npm run api:dev
npm run web:dev
npm run api:test
npm run web:test
```

Para aplicar el esquema a D1 local y ejecutar las pruebas de la API:

```sh
npm --workspace @nfcompra/api run db:migrate:local
npm run api:test
```

Al iniciar la API local con `npm run api:dev`, `GET /health` responde `200` con `{ "status": "ok" }`. El Worker y D1 se ejecutan unicamente en local: no hay ningun entorno desplegado.

El comando de pruebas web ya esta configurado en el workspace, pero su suite se incorporara en una tarea posterior. Los comandos de desarrollo no despliegan servicios.

## Estructura inicial

- `apps/api`: Worker local de Cloudflare, esquema y migraciones D1, y prueba de salud.
- `apps/web`: configuracion inicial de la aplicacion web con Vite y React.
- `apps/android`: estructura de modulos reservada para la futura app Compose; Gradle aun no esta configurado.
- `docs`: diseno, plan de implementacion y documentos de arquitectura.
