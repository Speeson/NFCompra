# NFCompra Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar la API de NFCompra en Cloudflare Workers/D1 y la PWA en Vercel bajo `api.nfcompra.esgarpe.dev` y `nfcompra.esgarpe.dev`.

**Architecture:** La configuracion local de Wrangler permanece aislada de produccion. Un archivo de produccion enlaza el Worker `nfcompra-api` a D1 con el binding `DB`, y sus secretos se cargan exclusivamente en Cloudflare. La PWA compilada por Vercel usa la API con origen cruzado permitido de forma explicita.

**Tech Stack:** Cloudflare Workers, D1, Wrangler 4, Resend, React/Vite PWA, Vercel.

## Global Constraints

- No subir cambios a GitHub, crear PR, ni desplegar servicios sin autorizacion expresa de la persona usuaria.
- No incluir `JWT_SECRET`, `RESEND_API_KEY`, tokens ni contrasenas en Git, documentacion, salida de comandos o capturas.
- Usar `nfcompra-production` en WEUR con binding Worker `DB`.
- Produccion usa `https://api.nfcompra.esgarpe.dev` para la API y `https://nfcompra.esgarpe.dev` para la PWA.
- Actualizar `README.md` solo tras verificar cada tarea implementada.

---

### Task 1: Configuracion de produccion y remitente de Resend

**Files:**
- Create: `apps/api/wrangler.production.jsonc`
- Modify: `apps/api/src/email/resend-email-sender.ts:6-10`
- Create: `apps/api/test/resend-email-sender.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `Env` con `RESEND_API_KEY`, las migraciones de `apps/api/migrations`, y la D1 ya creada `nfcompra-production` (`c9849220-3753-482c-8a0d-a4d40a93856b`).
- Produces: archivo apto para `wrangler --config wrangler.production.jsonc` y correos con remitente `NFCompra <no-reply@esgarpe.dev>`.

- [ ] **Step 1: Write the failing test**

Crear `apps/api/test/resend-email-sender.test.ts` con un `fetch` simulado que verifique:

```ts
expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
  from: 'NFCompra <no-reply@esgarpe.dev>',
  to: ['persona@example.com'],
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx --workspace @nfcompra/api vitest run test/resend-email-sender.test.ts`

Expected: FAIL porque el remitente actual es `no-reply@nfcompra.esgarpe.dev`.

- [ ] **Step 3: Write the minimal production configuration**

Crear `apps/api/wrangler.production.jsonc` con el mismo `name`, `main`, `compatibility_date` y `migrations_dir` que `wrangler.jsonc`, y:

```jsonc
"d1_databases": [{
  "binding": "DB",
  "database_name": "nfcompra-production",
  "database_id": "c9849220-3753-482c-8a0d-a4d40a93856b",
  "migrations_dir": "migrations"
}],
"vars": {
  "APP_BASE_URL": "https://nfcompra.esgarpe.dev",
  "ALLOWED_ORIGINS": "https://nfcompra.esgarpe.dev"
}
```

Cambiar exactamente el campo `from` de `ResendEmailSender.send` a `NFCompra <no-reply@esgarpe.dev>`.

- [ ] **Step 4: Verify the task**

Run:

```powershell
npx --workspace @nfcompra/api vitest run test/resend-email-sender.test.ts
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npx wrangler --config apps/api/wrangler.production.jsonc deploy --dry-run
```

Expected: pruebas y tipos correctos; `dry-run` muestra el binding `DB` sin publicar.

- [ ] **Step 5: Document and commit locally**

Actualizar README solo con los archivos de configuracion comprobados, sin ID ni secretos. Ejecutar `git diff --check` y:

```powershell
git add apps/api/wrangler.production.jsonc apps/api/src/email/resend-email-sender.ts apps/api/test/resend-email-sender.test.ts README.md
git commit -m "chore: prepare production worker configuration"
```

### Task 2: Migrar y verificar D1 de produccion

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `apps/api/wrangler.production.jsonc` y migraciones `0001` a `0006`.
- Produces: esquema D1 completo antes del primer Worker publico.

- [ ] **Step 1: Inspect migrations and target**

Run:

```powershell
Get-ChildItem apps/api/migrations -Name
npx wrangler d1 migrations list nfcompra-production --remote --config apps/api/wrangler.production.jsonc
```

Expected: seis migraciones locales y ninguna aplicada en la base nueva.

- [ ] **Step 2: Apply remote migrations with explicit authorization**

Run: `npx wrangler d1 migrations apply nfcompra-production --remote --config apps/api/wrangler.production.jsonc`

Expected: aplicacion ordenada, incluida `0006_notifications.sql`.

- [ ] **Step 3: Verify schema without user data**

Run:

```powershell
npx wrangler d1 execute nfcompra-production --remote --config apps/api/wrangler.production.jsonc --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
npx wrangler d1 migrations list nfcompra-production --remote --config apps/api/wrangler.production.jsonc
```

Expected: tablas de autenticacion, hogares, listas, productos, invitaciones, notificaciones y operaciones; las seis migraciones aplicadas.

- [ ] **Step 4: Document and commit locally**

Documentar el comando de migracion comprobado sin ID ni secretos, y crear:

```powershell
git add README.md
git commit -m "docs: document production database migration"
```

### Task 3: Secretos, Worker y dominio de API

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: D1 migrada, configuracion de produccion, `JWT_SECRET` guardado por la persona usuaria y `RESEND_API_KEY` exclusiva de NFCompra.
- Produces: Worker `nfcompra-api` en URL temporal y `https://api.nfcompra.esgarpe.dev`.

- [ ] **Step 1: Load secrets interactively with explicit authorization**

Ejecutar por separado, introduciendo los valores solo en el prompt:

```powershell
npx wrangler secret put JWT_SECRET --config apps/api/wrangler.production.jsonc
npx wrangler secret put RESEND_API_KEY --config apps/api/wrangler.production.jsonc
```

Expected: secretos configurados sin imprimir sus valores.

- [ ] **Step 2: Deploy and test the temporary Worker URL**

Run: `npx wrangler deploy --config apps/api/wrangler.production.jsonc`

Expected: URL `*.workers.dev`. Ejecutar `Invoke-RestMethod <url-temporal>/health` y comprobar `{ status: 'ok' }`.

- [ ] **Step 3: Attach the API custom domain with explicit authorization**

En Cloudflare, abrir Worker `nfcompra-api`, añadir `api.nfcompra.esgarpe.dev` y aceptar solo el registro que el panel presente.

Verificar:

```powershell
Invoke-WebRequest https://api.nfcompra.esgarpe.dev/health
Invoke-WebRequest https://api.nfcompra.esgarpe.dev/v1/auth/resend-verification -Method OPTIONS -Headers @{ Origin = 'https://nfcompra.esgarpe.dev' }
```

Expected: salud 200 y OPTIONS 204 con `access-control-allow-origin: https://nfcompra.esgarpe.dev` y `access-control-allow-credentials: true`.

- [ ] **Step 4: Document and commit locally**

Documentar las URL verificadas y el proceso de secretos sin sus valores:

```powershell
git add README.md
git commit -m "docs: record production API verification"
```

### Task 4: Proyecto Vercel, dominio web y prueba completa

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: API sana en `https://api.nfcompra.esgarpe.dev/v1` y `VITE_API_BASE_URL`.
- Produces: PWA en `https://nfcompra.esgarpe.dev` contra la API de produccion.

- [ ] **Step 1: Test the production API base locally**

Run:

```powershell
$env:VITE_API_BASE_URL = 'https://api.nfcompra.esgarpe.dev/v1'
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
Remove-Item Env:VITE_API_BASE_URL
```

Expected: pruebas, tipos y build correctos; ningun secreto en `apps/web/dist`.

- [ ] **Step 2: Create and import the Vercel project with explicit authorization**

Importar `Speeson/NFCompra` manteniendo la raiz del repositorio y configurar:

```text
Build Command: npm --workspace @nfcompra/web run build
Output Directory: apps/web/dist
Install Command: npm install
Production Environment Variable: VITE_API_BASE_URL=https://api.nfcompra.esgarpe.dev/v1
```

Desplegar solo `main` tras confirmar el build.

- [ ] **Step 3: Attach the PWA domain with explicit authorization**

En Vercel añadir `nfcompra.esgarpe.dev`; copiar en Cloudflare solo el registro DNS exacto solicitado y esperar HTTPS valido.

- [ ] **Step 4: Test the public user journey**

En la PWA publica: registrar cuenta de prueba, recibir correo desde `no-reply@esgarpe.dev`, verificarla, iniciar sesion, crear hogar, lista y producto, crear/aceptar invitacion con otra cuenta, comprobar notificaciones y recargar para validar refresh de sesion.

- [ ] **Step 5: Document and commit locally**

Documentar dominios, comandos y estado verificado, sin cuentas de prueba, secretos ni IDs:

```powershell
git add README.md
git commit -m "docs: document verified web deployment"
```

