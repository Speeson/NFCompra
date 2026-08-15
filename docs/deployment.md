# Despliegue, impacto y releases

NFCompra tiene tres unidades desplegables independientes:

- **Web**: `apps/web`, React/Vite PWA desplegada en Vercel.
- **API**: `apps/api`, Cloudflare Worker con D1.
- **Android**: `apps/android`, APK publicado en GitHub Releases.

## Deployment Impact

La fuente de verdad es `scripts/deploy-impact.mjs`.

```sh
npm run deploy:impact
npm run deploy:impact -- --format json
node scripts/deploy-impact.mjs --base <sha-base> --head <sha-head> --format json
```

Reglas principales:

- `apps/web/**` relevante de runtime/build afecta Web.
- `apps/api/**` relevante de runtime/build, migraciones y Wrangler afecta API.
- `apps/android/**` relevante de runtime/build afecta Android build; solo cambios de producto/runtime afectan Android release.
- `package-lock.json` afecta Web y API porque son npm workspaces.
- `.changes/**`, `docs/**`, screenshots de raiz, README-only y workflows no son cambios desplegables.
- Cambios Android solo de CI/build performance, como `org.gradle.caching=true`, workflow Android, wrapper o tooling de release, pueden requerir validacion Android pero no crean release.
- Un cambio solo de `versionCode`/`versionName` en `apps/android/app/build.gradle.kts` no crea otro release Android.

El script soporta rangos Git para CI y cambios locales sin rango. En JSON, `androidBuild` indica validacion/build Android y `android` indica release Android requerido. GitHub Actions recalcula siempre el impacto antes de validar, desplegar o publicar.

## Changesets

Los cambios user-facing se documentan en `.changes/pending/*.json`:

```json
{
  "components": ["android"],
  "type": "minor",
  "category": "added",
  "summary": "Added account deletion from Settings.",
  "details": ["Deletes local session data after the account is removed."]
}
```

Campos:

- `components`: `web`, `api`, `android`.
- `type`: `patch`, `minor`, `major`.
- `category`: `added`, `changed`, `fixed`, `removed`, `security`.
- `summary`: texto user-facing.
- `details`: opcional.

No crees changesets para docs internas, screenshots, comentarios, workflows o mantenimiento sin impacto de producto.

Validacion:

```sh
npm run changeset:validate
```

## Android versionado y changelog

La fuente de verdad sigue en `apps/android/app/build.gradle.kts`:

- `versionName`: SemVer.
- `versionCode`: entero monotonicamente creciente.

Plan local:

```sh
npm run android:release-plan -- --format json
npm run android:release-plan -- --bump minor
```

Con varios changesets Android se usa el mayor impacto: `major` > `minor` > `patch`.

El workflow `release-android.yml`:

1. valida Android;
2. calcula version desde changesets;
3. sube `versionCode + 1`;
4. archiva metadata en `.changes/releases/android-v<version>.*`;
5. crea commit `Release Android v<version>`;
6. crea tag `v<version>`;
7. firma y construye APK;
8. publica GitHub Release con asset `NFCompra-release.apk`.

El modo manual `release-dry-run` valida los secrets de firma, construye el APK release firmado, verifica su firma y puede subir solo el APK como artifact temporal. No cambia `versionCode`/`versionName`, no mueve changesets, no crea commit, tag ni GitHub Release.

## GitHub Actions

Workflows:

- `.github/workflows/deploy.yml`: orquestador automatico en `push main` y manual `Deploy NFCompra`.
- `.github/workflows/deploy-web.yml`: validacion Web y deploy manual Vercel CLI.
- `.github/workflows/deploy-api.yml`: tests/typecheck, migraciones D1 y `wrangler deploy`.
- `.github/workflows/release-android.yml`: validacion, versionado, firma APK y GitHub Release.

Manual:

1. GitHub > Actions > Deploy NFCompra > Run workflow.
2. `mode`: `auto`, `everything`, `web`, `api`, `android`, `custom`.
3. `components`: usar solo con `custom`, por ejemplo `web,api`.
4. `android_release_mode`:
   - `build-only`: compila y ejecuta tests Android sin firma ni publicacion.
   - `release-dry-run`: valida firma y APK release firmado sin commit, tag ni GitHub Release.
   - `release`: crea nueva version desde changesets y publica GitHub Release.
5. `android_version_bump`: `auto`, `patch`, `minor`, `major`.

Concurrencia:

- El orquestador `Deploy NFCompra` serializa runs por branch y no cancela runs en progreso.
- Web automatico evita builds stale desde `ignoreCommand`: si el commit de Vercel ya no es HEAD de la rama, sale con `0` y salta el build.
- API automatico comprueba que `GITHUB_SHA` sigue siendo HEAD de la rama antes de aplicar migraciones o desplegar Worker; si fue superseded, valida pero salta el deploy.
- Android automatico ejecuta `build-only` cuando solo hay `androidBuild=true`; solo usa `release` cuando `android=true`.
- Web/API manuales no se cancelan entre si; se serializan por componente y branch.
- Android usa grupo `android-release-main` para evitar dos versiones calculadas a la vez y no cancela releases en progreso.

## Vercel

Comportamiento anterior: cada push a `main` podia iniciar build Vercel.

Comportamiento nuevo: se conserva la integracion Git de Vercel para no duplicar deploys automaticos desde GitHub Actions, pero `vercel.json` ejecuta:

```json
"ignoreCommand": "node scripts/vercel-ignore-build.mjs"
```

Si Deployment Impact no marca Web, el comando sale con `0` y Vercel salta el build. Si Web esta afectado o no puede calcularse con seguridad, sale con `1` y Vercel compila.

Para redeploy manual Web sin commit, usa `Deploy NFCompra` con `mode=web`; ese camino usa Vercel CLI y requiere secretos.

## Cloudflare API

API se despliega solo si el impacto API es verdadero o si se fuerza manualmente.

Flujo:

```sh
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
npx wrangler deploy --config wrangler.production.jsonc
```

Las migraciones D1 se aplican antes del deploy. Son forward-only; cualquier correccion se hace con una migracion nueva.

## Secretos y variables

GitHub Actions secrets requeridos para despliegues/release:

- `CLOUDFLARE_API_TOKEN`: token con permisos para Workers Scripts edit/deploy y D1 edit en la cuenta.
- `ANDROID_RELEASE_KEYSTORE_BASE64`: keystore release codificada en base64.
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

GitHub Actions secrets opcionales, solo para redeploy manual Web desde `Deploy NFCompra` con `mode=web` o combinaciones que incluyan Web:

- `VERCEL_TOKEN`: token Vercel para deploy manual Web por CLI.
- `VERCEL_ORG_ID`: org/team id del proyecto Vercel.
- `VERCEL_PROJECT_ID`: project id Vercel de NFCompra Web.

Para generar `ANDROID_RELEASE_KEYSTORE_BASE64` desde el keystore release local:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\esteb\.android\nfcompra-release.jks")) | Set-Clipboard
```

Pega el resultado como valor del secret. El workflow reconstruye el keystore en `$RUNNER_TEMP/nfcompra-release.jks` y no lo sube como artefacto.

No guardes keystores, tokens ni passwords en Git.

## Troubleshooting

- Ver impacto local: `npm run deploy:impact -- --format json`.
- Redeploy Web: workflow manual `mode=web`.
- Redeploy API: workflow manual `mode=api`.
- Rebuild Android sin release: workflow manual `mode=android`, `android_release_mode=build-only`.
- Validar firma Android sin release: workflow manual `mode=android`, `android_release_mode=release-dry-run`.
- Publicar Android: workflow manual `mode=android`, `android_release_mode=release`.
- Tag existente al publicar: revisar GitHub Releases; crea un changeset/version nueva si ya fue publicado correctamente.
- Changesets invalidos: `npm run changeset:validate`.
