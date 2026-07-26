# NFCompra

Base del monorepo de NFCompra. El cimiento actual contiene los workspaces de la API y la web, junto con la estructura inicial de Android. Todavía no hay funcionalidades de compra, migraciones D1, pruebas ni servicios desplegados.

## Prerrequisitos

- Node.js LTS y npm.
- Wrangler instalado para ejecutar la API local de Cloudflare Workers. La autenticación solo será necesaria cuando se realicen operaciones remotas autorizadas.
- Android Studio y JDK 17 para el futuro proyecto Android.

## Comandos

Desde la raíz del repositorio:

```sh
npm install
npm run api:dev
npm run web:dev
npm run api:test
npm run web:test
```

Los comandos de pruebas de API y web ya están configurados en el workspace, pero sus suites se incorporarán en la siguiente tarea. Los comandos de desarrollo no despliegan servicios.

## Estructura inicial

- `apps/api`: configuración inicial del Worker de Cloudflare.
- `apps/web`: configuración inicial de la aplicación web con Vite y React.
- `apps/android`: estructura de módulos reservada para la futura app Compose; Gradle aún no está configurado.
- `docs`: diseño, plan de implementación y documentos de arquitectura.
