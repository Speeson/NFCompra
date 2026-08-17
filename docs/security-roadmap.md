# NFCompra — Security Audit & Hardening Roadmap

> Documento vivo de seguridad para `Speeson/NFCompra`.
>
> **Fuente de verdad:** rama `main` del repositorio.  
> **Baseline de la auditoría inicial:** commit `b5ac8703d4a3fbc78ee86724419436902bae5437` (17-08-2026).
>
> Antes de implementar cualquier SEC, comprobar el estado actual de `main`, ya que este documento puede quedarse desactualizado.

---

## 1. Objetivo

Este documento centraliza los hallazgos de la revisión de seguridad de NFCompra y sirve como roadmap para su endurecimiento progresivo.

La auditoría inicial fue una **revisión estática de arquitectura y código**, no un pentest dinámico. Se revisaron especialmente:

- API Cloudflare Worker + D1.
- Autenticación y sesiones.
- Hogares, listas, productos, invitaciones y notificaciones.
- Catálogo global.
- PWA React/Vite.
- Android: Keystore, deep links, backups, red y autoupdater.
- GitHub Actions, releases y signing Android.
- Configuración Vercel/Cloudflare presente en el repositorio.

### Estado general

NFCompra tiene una base de seguridad razonablemente buena para un MVP:

- SQL parametrizado mediante `prepare(...).bind(...)`.
- Access tokens de corta duración.
- Refresh tokens rotatorios y almacenados como hash.
- `session_version` para invalidación de sesiones.
- Access token Web solo en memoria.
- Refresh Web mediante cookie `HttpOnly`.
- Tokens Android cifrados con AES-GCM y Android Keystore.
- Tokens de recuperación/invitación de alta entropía almacenados como hash.
- Autorización por miembro/propietario en hogares y listas.
- CORS de producción limitado al dominio Web.
- Secretos y keystores fuera del repositorio.

No se detectaron durante la revisión inicial:

- SQL injection evidente.
- Passwords almacenadas en texto plano.
- Refresh token Web guardado en `localStorage`.
- Tokens Android en texto plano.
- Un IDOR directo obvio que permita editar listas ajenas.
- Un `TrustManager` inseguro en Android.
- Secretos Cloudflare/Resend/signing hardcodeados en los ficheros revisados.

Aun así, existen varios puntos que conviene corregir antes de una apertura amplia a usuarios desconocidos.

---

## 2. Convención de estado

Cada hallazgo debe mantenerse con uno de estos estados:

- `[ ] PENDIENTE`
- `[~] EN CURSO`
- `[x] RESUELTO`
- `[-] DESCARTADO`

Cuando un SEC se cierre:

1. actualizar su estado;
2. indicar commit o PR si existe;
3. añadir brevemente la solución aplicada;
4. anotar las verificaciones realizadas;
5. no marcarlo como resuelto únicamente porque compile.

---

# 3. Prioridad P0

## SEC-01 — Autorización insuficiente del catálogo global

**Estado:** `[x] RESUELTO`  
**Severidad:** ALTA  
**Categoría:** Broken Function Level Authorization / autorización funcional  
**Coste estimado inicial:** 1–2 jornadas

### Problema confirmado

En el baseline auditado, las mutaciones del catálogo global exigen únicamente que exista un usuario autenticado.

Rutas afectadas:

- `POST /v1/product-categories`
- `PATCH /v1/product-categories/:id`
- `DELETE /v1/product-categories/:id`
- `POST /v1/product-catalog`
- `PATCH /v1/product-catalog/:id`
- `DELETE /v1/product-catalog/:id`

Fichero principal:

- `apps/api/src/catalog/routes.ts`

El patrón actual es esencialmente:

```ts
if (!user) return errorResponse('UNAUTHORIZED', ...);
```

No existe en esa ruta una comprobación de privilegio administrativo antes de modificar:

- `product_categories`
- `product_catalog`

Estas tablas representan el catálogo compartido/global de NFCompra.

### Impacto

Cualquier usuario registrado podría potencialmente:

- crear categorías globales;
- modificar categorías globales;
- borrar categorías;
- crear productos globales;
- modificar productos existentes;
- desactivar/borrar productos del catálogo;
- degradar el catálogo del resto de usuarios;
- provocar cambios continuos en el snapshot/versionado.

### Resultado deseado

Separar claramente:

#### Catálogo oficial/global

- lectura permitida según el comportamiento actual;
- favoritos personales permitidos a usuarios autenticados;
- **mutaciones globales solo para administradores**.

#### Datos personales

Los favoritos deben seguir siendo por usuario y no deben requerir rol admin.

Si en el futuro se permiten productos creados por usuarios, no deben escribirse directamente en el catálogo oficial salvo que exista un flujo explícito de moderación/promoción.

### Dirección de implementación recomendada

Introducir autorización administrativa explícita en servidor.

Diseño mínimo aceptable:

```text
users.role = 'user' | 'admin'
```

o un mecanismo equivalente que encaje mejor con la arquitectura actual.

La API debe ser la autoridad. Ocultar botones en Web/Android **no es una medida de seguridad suficiente**.

Crear una abstracción clara, por ejemplo:

```text
requireAdmin(...)
```

o equivalente, reutilizable en futuras rutas administrativas.

### Reglas

- No romper GET públicos del catálogo.
- No romper favoritos.
- Un usuario normal autenticado debe recibir `403 FORBIDDEN` en mutaciones globales.
- Un anónimo debe seguir recibiendo `401 UNAUTHORIZED`.
- Un administrador debe conservar capacidad de mutar el catálogo.
- No confiar en `role` enviado por el cliente.
- El rol debe obtenerse/validarse desde estado controlado por servidor.
- No introducir secretos o IDs administrativos hardcodeados en el código fuente.
- Mantener compatibilidad con D1 y Cloudflare Workers.

### Tests mínimos

Cubrir al menos:

1. anónimo no puede crear categoría → 401;
2. usuario normal no puede crear categoría → 403;
3. admin puede crear categoría;
4. usuario normal no puede editar categoría → 403;
5. usuario normal no puede borrar categoría → 403;
6. usuario normal no puede crear producto → 403;
7. usuario normal no puede editar producto → 403;
8. usuario normal no puede borrar producto → 403;
9. favoritos siguen funcionando para usuario normal;
10. GET de catálogo/categorías/snapshot mantienen su contrato actual.

### Verificación esperada

Como mínimo:

```bash
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
```

Ejecutar validaciones Android únicamente si la implementación toca Android.

### Criterio de cierre

SEC-01 solo puede marcarse como resuelto cuando:

- la autorización administrativa existe en backend;
- todos los endpoints globales están protegidos;
- favoritos y lectura siguen funcionando;
- existen tests negativos de autorización;
- las pruebas relevantes pasan.

### Solución aplicada (2026-08-17)

Modelo de autorización:

- `users.role` con valores `'user'` | `'admin'` (`TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin'))`), añadido mediante la migración `apps/api/migrations/0015_user_role.sql`.
- El rol se lee siempre desde D1 en cada petición (`findUserSessionById` → `AuthUser.role`). No se incluye en el JWT y nunca se confía en un `role` enviado por el cliente (cuerpo, cabecera, query).
- Helper reutilizable `requireAdmin(user)` en `apps/api/src/middleware/admin.ts`: devuelve `401 UNAUTHORIZED` sin sesión y `403 FORBIDDEN` para usuarios no administradores.
- Las seis rutas de mutación del catálogo global usan `requireAdmin`:
  - `POST /v1/product-categories`
  - `PATCH /v1/product-categories/:id`
  - `DELETE /v1/product-categories/:id`
  - `POST /v1/product-catalog`
  - `PATCH /v1/product-catalog/:id`
  - `DELETE /v1/product-catalog/:id`
- La lectura del catálogo sigue siendo pública y los favoritos siguen funcionando para cualquier usuario autenticado.
- `GET /v1/me` expone `role` para que los clientes adapten la UI; el servidor no depende de esa copia para autorizar.
- El registro crea siempre `role = 'user'` (`createUser` lo fija explícitamente); un `role` enviado en el registro o en `PATCH /v1/me` se ignora.
- Web y Android ocultan los controles de gestión del catálogo (crear/editar/eliminar) para usuarios no administradores. La seguridad no depende de ocultar la UI: el backend sigue siendo la autoridad.

Promoción/revocación de `admin` (operación interna, sin endpoint público):

- **Promover** a un usuario existente (Cloudflare dashboard / D1 console):
  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'usuario@example.com';
  ```
- **Promover** con Wrangler (entorno remoto):
  ```bash
  npx wrangler d1 execute <DB_NAME> --remote --command "UPDATE users SET role = 'admin' WHERE email = 'usuario@example.com';"
  ```
- **Revocar** (volver a `user`):
  ```sql
  UPDATE users SET role = 'user' WHERE email = 'usuario@example.com';
  ```

El cambio de rol es inmediato: la autorización se evalúa leyendo `users.role` en cada petición, sin necesidad de renovar tokens ni sesiones.

No existe ningún endpoint público ni autenticado de gestión de roles: no hay `PATCH /me` con `role`, ni `PATCH /users/:id/role`, ni auto-promoción. No se hardcodea ningún correo, ID ni secreto administrativo.

Verificación ejecutada:

```bash
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
# Android (desde apps/android):
.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

Todas las comprobaciones pasan.

### Corrección posterior — Catálogo de hogar (CAT-01)

SEC-01 sigue resuelto: el catálogo del sistema es admin-only. Como corrección funcional se añadió un catálogo personalizado por hogar gestionado por sus miembros.

- **Alcance explícito**: `product_categories` y `product_catalog` ahora tienen `scope = 'system' | 'household'`, `household_id` y `created_by` (migración `0016_catalog_scope.sql`). El `scope` de autorización es independiente de `source` (procedencia).
- **Catálogo del sistema** (`scope='system'`, `household_id NULL`): mutaciones solo de administradores (SEC-01 intacto). Lectura pública; favoritos para cualquier usuario autenticado.
- **Catálogo de hogar** (`scope='household'`, `household_id = <hogar>`): cualquier miembro del hogar puede crear, editar y borrar sus productos y categorías. La pertenencia se valida en servidor (`isHouseholdMember`); nunca se confía en el `householdId` del cliente.
- **Aislamiento**: las consultas filtran `scope='system' OR (scope='household' AND household_id = actual)`. Un miembro de H1 nunca recibe productos ni categorías de H2. Las referencias cruzadas (producto o categoría padre que apunte a la categoría de otro hogar, o un producto de sistema que apunte a una categoría de hogar) se rechazan con `400 CATEGORY_SCOPE_MISMATCH`.
- **Búsqueda unificada**: la búsqueda/snapshot con `householdId` devuelve sistema + hogar actual en el mismo resultado y con el mismo ranking (favoritos primero); en empate de relevancia se prefiere el resultado del hogar. No existe una búsqueda separada para productos de hogar.
- **Favoritos**: funcionan igual para productos de sistema y de hogar; se rechaza marcar como favorito un producto de otro hogar (`403`).
- **API**: rutas de mutación explícitas por hogar `POST/PATCH/DELETE /v1/households/:householdId/product-catalog[...]` y `.../product-categories[...]`. Lecturas: `GET /v1/product-catalog?search=&householdId=`, `.../snapshot?householdId=`, `.../version?householdId=` y `.../product-categories?householdId=`. El contrato expone `scope`, `householdId` y `permissions.canEdit/canDelete` (solo pistas de UI; el servidor re-verifica en cada mutación).
- **Versionado/caché**: la versión del catálogo del sistema solo cambia con mutaciones del sistema; cada hogar tiene su propia versión combinada. Una mutación en H1 no invalida el catálogo global de los demás. La caché offline de Android se aísla por hogar.
- **Borrado**: al borrar un hogar (o un hogar sin sucesor en el borrado de cuenta) se eliminan sus productos/categorías de hogar y sus favoritos; `created_by` se anula al borrar la cuenta.
- **UI**: Web y Android ocultan los controles de gestión del sistema a usuarios no administradores y muestran controles de creación de hogar a los miembros. Los resultados de hogar se distinguen con un acento violeta sutil y un pequeño icono de casa (sin etiquetas de texto). La API sigue siendo la autoridad.

---

## SEC-02 — Rate limiting y protección anti-abuso

**Estado:** `[ ] PENDIENTE`  
**Severidad:** ALTA si no existen controles equivalentes externos  
**Coste estimado inicial:** 1–2 jornadas

### Riesgo

No se detectó en el repositorio una capa explícita de rate limiting para operaciones sensibles.

Endpoints especialmente relevantes:

- login;
- register;
- forgot-password;
- resend-verification;
- OTP;
- invitaciones;
- endpoints de catálogo costosos.

### Nota

Pueden existir reglas manuales de Cloudflare que no son visibles en el repositorio. Verificarlas antes de implementar una segunda capa innecesaria.

### Dirección recomendada

Combinar:

- protección edge/Cloudflare por IP;
- límites semánticos de aplicación por cuenta/email/user/endpoint.

Evitar bloqueos permanentes que permitan provocar DoS contra otra cuenta.

---

## SEC-03 — Hardening de GitHub Actions y protección de `main`

**Estado:** `[ ] PENDIENTE`  
**Severidad:** ALTA  
**Coste estimado inicial:** 1–2 jornadas

### Problemas detectados en el baseline

- `main` sin protección de rama.
- Actions de terceros referenciadas mediante tags como `@v4` / `@v3`, no SHA inmutable.
- El workflow Android ejecuta múltiples pasos dentro de un job con `contents: write`.
- Secretos de signing permanecen disponibles a pasos posteriores mediante entorno del job.

### Dirección recomendada

Separar conceptualmente:

1. `validate` → `contents: read`;
2. `build/sign` → mínimos permisos y acceso exclusivo a signing;
3. `publish` → `contents: write`, sin secretos de signing y sin ejecutar código innecesario.

Además:

- pin de Actions por SHA;
- branch protection/ruleset;
- required checks;
- sin force push;
- mínimos permisos por job.

---

# 4. Prioridad P1

## SEC-04 — Cambio autenticado de contraseña no invalida sesiones existentes

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 2–8 h

El reset de contraseña invalida sesiones, pero el cambio autenticado debe revisarse para garantizar el mismo resultado de seguridad.

Resultado recomendado:

- cambiar contraseña;
- invalidar sesiones anteriores;
- opcionalmente emitir una nueva sesión al dispositivo actual para mejor UX.

---

## SEC-05 — Work factor de PBKDF2

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 4–8 h

El baseline utiliza PBKDF2-SHA256 con 100.000 iteraciones.

Recomendación:

- benchmark en Cloudflare Worker;
- subir el coste;
- migración progresiva al login;
- estudiar Argon2id solo si encaja correctamente con Workers y no introduce una penalización desproporcionada.

No forzar cambio masivo de contraseñas si puede hacerse rehash progresivo.

---

## SEC-06 — Protección del OTP frente a cracking offline

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 2–4 h

Un OTP de seis cifras tiene solo 1.000.000 de combinaciones.

Aunque almacenar `SHA256(OTP)` evita texto plano y existe límite online de intentos, una copia de DB permitiría probar offline el espacio completo.

Recomendación:

```text
HMAC-SHA256(OTP_PEPPER, OTP)
```

con `OTP_PEPPER` almacenado como Worker Secret.

Los tokens de recuperación de alta entropía pueden seguir almacenándose mediante SHA-256.

---

## SEC-07 — Un owner puede dejar un hogar huérfano

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 3–6 h

Debe mantenerse la invariante:

> Todo hogar existente tiene exactamente un owner válido y miembro del hogar.

Al abandonar:

- owner con otros miembros → transferir propiedad según la regla de negocio definida;
- owner sin otros miembros → eliminar el hogar o bloquear salida según producto;
- miembro normal → salida normal.

Reutilizar, si es posible, la lógica ya existente del borrado de cuenta.

---

## SEC-09 — CSP y security headers Web

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 4–8 h

Añadir una política CSP compatible con la PWA y cabeceras como:

- `Content-Security-Policy`;
- `X-Content-Type-Options`;
- `Referrer-Policy`;
- `Permissions-Policy`;
- `frame-ancestors` mediante CSP.

El `index.html` contiene script inline para el tema; moverlo o resolverlo mediante hash/nonces antes de imponer `script-src 'self'`.

---

## SEC-11 — Android backups

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 2–4 h

Baseline:

```xml
android:allowBackup="true"
```

Decidir entre:

- deshabilitar backups;
- o definir `dataExtractionRules` excluyendo sesión, bases locales y datos sensibles.

---

## SEC-12 — App Link de invitaciones

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 2–4 h

Los enlaces HTTPS de hogar utilizan verificación, pero revisar específicamente el deep link de invitación.

Para secretos de invitación:

- preferir HTTPS App Link verificado;
- `android:autoVerify="true"`;
- apoyarse en `.well-known/assetlinks.json`;
- reducir dependencia del custom scheme `nfcompra://` para secretos.

---

## SEC-13 — APK debug conecta con producción por defecto

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA  
**Coste estimado:** 3–6 h sin staging; más si se crea entorno staging

Separar claramente:

```text
debug → local/staging
release → production
```

Idealmente usar `applicationIdSuffix = ".debug"` o equivalente para que debug y release sean aplicaciones distintas.

El acceso a producción desde debug debería ser explícito, no el valor por defecto.

---

# 5. Prioridad P2

## SEC-08 — Enumeración de existencia de objetos

**Estado:** `[ ] PENDIENTE`  
**Severidad:** BAJA  
**Coste estimado:** 2–4 h

Evitar, cuando sea razonable, diferencias innecesarias entre:

- recurso inexistente;
- recurso existente pero inaccesible.

Los UUID aleatorios reducen bastante el riesgo actual.

---

## SEC-10 — Token de invitación en URL/sessionStorage

**Estado:** `[ ] PENDIENTE`  
**Severidad:** BAJA  
**Coste estimado:** 1–3 h

Una vez capturado el token de la URL:

```text
/invitations/accept?token=...
```

limpiar la barra mediante `history.replaceState()` y mantener el secreto únicamente el tiempo imprescindible.

No romper la continuación de login.

---

## SEC-14 — Hardening del autoupdater Android

**Estado:** `[ ] PENDIENTE`  
**Severidad:** MEDIA-BAJA  
**Coste estimado:** 6–12 h

Antes de lanzar el instalador validar explícitamente:

- nombre exacto del asset esperado;
- package name;
- versión;
- certificado firmante/fingerprint esperado;
- opcionalmente checksum publicado.

Eliminar fallback a “primer `.apk` disponible” si no es imprescindible.

---

## SEC-15 — Hardening JWT

**Estado:** `[ ] PENDIENTE`  
**Severidad:** BAJA-MEDIA  
**Coste estimado:** 4–8 h

La implementación JWT es propia.

Revisar:

- número exacto de segmentos;
- `alg`;
- `typ`;
- `iss`;
- `aud`;
- `iat`;
- `exp`;
- TTL máximo;
- límites de tamaño.

Preferir librería madura compatible con Workers si la dependencia resulta razonable.

---

# 6. Seguridad continua

## SEC-16 — SAST, dependencias y secret scanning

**Estado:** `[ ] PENDIENTE`  
**Severidad:** PREVENTIVA  
**Coste estimado inicial:** 4–8 h

Automatizar, según disponibilidad del repositorio/plan:

- CodeQL o SAST equivalente;
- dependency scanning npm;
- revisión de dependencias Gradle;
- secret scanning;
- Dependabot/Renovate o equivalente;
- chequeos de seguridad en PR/main.

---

## SEC-17 — Logging y eventos de seguridad

**Estado:** `[ ] PENDIENTE`  
**Severidad:** PREVENTIVA

Registrar de forma segura eventos útiles como:

- múltiples fallos de login;
- cambios de contraseña;
- resets;
- invalidaciones de sesiones;
- abuso de invitaciones;
- acciones administrativas;
- anomalías de rate limit.

Nunca registrar:

- passwords;
- refresh/access tokens;
- OTP en claro;
- invitation tokens;
- secretos.

---

## SEC-18 — Retención y limpieza operativa

**Estado:** `[ ] PENDIENTE`  
**Severidad:** PREVENTIVA

Revisar crecimiento y política de limpieza de:

- `auth_tokens`;
- refresh tokens expirados/revocados;
- `sync_operations`;
- notificaciones;
- datos temporales.

El objetivo es minimizar exposición y evitar crecimiento indefinido de D1.

---

# 7. Privacidad

## PRIV-01 — Minimización de datos personales

**Estado:** `[ ] PENDIENTE`

Revisar si NFCompra necesita realmente almacenar:

- fecha de nacimiento;
- otros datos personales no esenciales.

Si un dato no tiene una función real, valorar dejar de recopilarlo.

---

# 8. Orden recomendado

Implementación recomendada:

```text
SEC-01  Autorización administrativa del catálogo
SEC-02  Rate limiting / anti-abuse
SEC-03  CI/CD + protección de main

SEC-04  Invalidación de sesiones al cambiar contraseña
SEC-06  OTP HMAC/pepper
SEC-05  Password hashing
SEC-07  Invariante owner/leave

SEC-09  CSP Web
SEC-11  Android backup
SEC-12  App Links
SEC-13  Debug separado de producción

SEC-14  Verificación updater APK
SEC-16  SAST / dependencias / secretos
SEC-15  Hardening JWT
SEC-08  Enumeración
SEC-10  Token en URL
SEC-17  Security logging
SEC-18  Retención
PRIV-01 Minimización
```

Los tres primeros son los prioritarios antes de una apertura amplia a usuarios desconocidos.

---

# 9. Estimación global inicial

### Hardening mínimo recomendado

P0 + autenticación esencial:

**aprox. 5–8 jornadas de desarrollo.**

### Hardening completo razonable

Incluyendo Web, Android, supply chain y automatización:

**aprox. 9–14 jornadas / 65–105 horas**, incluyendo pruebas y regresiones.

Estas cifras son orientativas y deben reajustarse después de inspeccionar el estado de `main` justo antes de cada SEC.

---

# 10. Reglas para agentes/Codex

Cuando un prompt indique implementar uno de estos hallazgos:

1. leer primero este documento;
2. leer `AGENTS.md` y las skills relevantes del repositorio;
3. inspeccionar el `main`/workspace actual y no asumir que el baseline sigue igual;
4. limitar cambios al SEC solicitado;
5. no implementar otros SEC “de paso” salvo que sean estrictamente necesarios;
6. mantener compatibilidad con API/Web/Android existente;
7. añadir tests negativos de seguridad además de los positivos;
8. ejecutar las verificaciones relevantes;
9. actualizar este documento únicamente después de verificar la solución;
10. no hacer `push`, release ni despliegue salvo instrucción explícita;
11. no publicar secretos ni configuraciones locales;
12. si aparece una decisión de arquitectura no trivial, documentar el trade-off antes de improvisar.

---

# 11. Historial

## 2026-08-17 — CAT-01 catálogo de hogar

Corrección/evolución posterior a SEC-01: se añadió un catálogo personalizado por hogar gestionado por sus miembros, manteniendo el catálogo del sistema como admin-only. Migración `0016_catalog_scope.sql`, rutas por hogar en `/v1/households/:householdId/product-catalog` y `.../product-categories`, aislamiento estricto por hogar y distinción visual violeta/casa en los resultados de búsqueda (Web y Android). Ver la nota CAT-01 en SEC-01.

## 2026-08-17 — SEC-01 resuelto

Se implementó la autorización administrativa del catálogo global:

- migración `0015_user_role.sql` (`users.role`, default `'user'`, CHECK `'user'`/`'admin'`);
- `requireAdmin()` en `apps/api/src/middleware/admin.ts`;
- protección de las seis rutas de mutación globales del catálogo;
- `role` incluido en `AuthUser` y en `GET /v1/me`; registro siempre con `role = 'user'`;
- clientes Web y Android ocultan la gestión del catálogo a usuarios no administradores;
- tests de autorización negativos y de migración (ver sección SEC-01).

## 2026-08-17 — Auditoría inicial

Baseline:

```text
b5ac8703d4a3fbc78ee86724419436902bae5437
```

Se creó el roadmap inicial y se priorizó SEC-01 como primera implementación.
