# CI/CD selectivo y versionado

## Objetivo

Implementar una base de CI/CD para NFCompra que responda de forma reproducible que componentes cambiaron, que validaciones y despliegues aplican, y cuando Android necesita nueva version/release. La deteccion debe vivir en scripts reutilizables por Codex, GitHub Actions y uso local.

## Diseño aprobado

- Web, API y Android se tratan como unidades desplegables independientes.
- `scripts/deploy-impact.mjs` es la fuente de verdad de impacto y usa Git/rangos reales.
- `.changes/pending/*.json` guarda cambios user-facing; no cuenta como cambio desplegable.
- Android conserva `versionCode`/`versionName` en `apps/android/app/build.gradle.kts`; el release automatizado crea un commit controlado de version y archiva changesets.
- Vercel mantiene la integracion Git existente, pero `vercel.json` usa `ignoreCommand` para saltar builds sin impacto Web. El deploy manual Web se hace desde GitHub Actions con Vercel CLI.
- API se valida, aplica migraciones D1 pendientes y despliega con Wrangler solo si hay impacto API o se fuerza manualmente.
- Android valida, calcula version por changesets, firma APK con secretos y publica GitHub Release solo si se fuerza o hay impacto Android con changesets pendientes.

## Arquitectura

- Scripts raiz: deteccion de impacto, gestion de changesets/version/changelog y filtro Vercel.
- Workflows GitHub: orquestador `Deploy NFCompra` y workflows reutilizables para Web/API/Android.
- Skill de Codex: `.agents/skills/deploy-impact`.
- Documentacion detallada: `docs/deployment.md`.

## Verificacion

- `node --test scripts/deploy-impact.test.mjs`
- `node --test scripts/android-release.test.mjs`
- `npm run deploy:impact -- --format json`
- Validacion YAML/actionlint de `.github/workflows`.
- Validaciones existentes cuando corresponda: API, Web y Android debug build.

## Fuera de alcance

- No se ejecutan despliegues reales, tags, releases ni push durante esta implementacion.
- No se migran secretos reales a GitHub; solo se documentan nombres.
- No se cambia comportamiento funcional de Web/API/Android.
