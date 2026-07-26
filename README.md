# NFCompra

Base del monorepo de NFCompra.

## Prerrequisitos

- Node.js LTS y npm.
- Wrangler autenticado para ejecutar la API de Cloudflare Workers.
- Android Studio y JDK 17 para el proyecto Android.

## Comandos

Desde la raíz del repositorio:

```sh
npm install
npm run api:dev
npm run web:dev
npm run api:test
npm run web:test
```

Para Android, desde `apps/android`:

```sh
./gradlew test
```
