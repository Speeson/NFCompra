# Informe de reparacion de la migracion 0006

## Estado

Completada. `0006_notifications.sql` esta aplicada en D1 de produccion y Wrangler confirma que no quedan migraciones pendientes. La tabla `notifications` aparece en el esquema remoto. No se desplego el Worker, no se cambiaron secretos, DNS ni Vercel, y no se ejecuto `git push` ni se creo una pull request.

## Causa raiz

Wrangler 4.114.0 aplica migraciones remotas enviando el payload SQL completo, incluido el `INSERT` en `d1_migrations`, al endpoint D1 `/query`. La migracion 0006 era la primera del proyecto que contenia triggers SQLite con cuerpos compuestos, saltos de linea internos y varios puntos y coma. El particionado remoto no preservaba esos cuerpos como unidades completas y devolvia `incomplete input`.

La primera hipotesis identifico ademas que el splitter local exportado por Wrangler dejaba contextos `CASE` abiertos cuando `END` iba seguido inmediatamente por coma y fusionaba los triggers `notifications_item_updated` y `notifications_item_deleted`. Separar esos `END` corrigio el splitter local, pero un reintento remoto controlado siguio fallando y demostro que esa no era toda la causa. El trazado del codigo instalado confirmo que la ruta remota envia el payload bruto, a diferencia de la ruta local que usa `splitSqlQuery`.

La reproduccion definitiva uso `D1Database.exec()` de Workerd con el payload bruto de 0006 y su registro de migracion. Reprodujo `incomplete input`. Al conservar exactamente las mismas diez sentencias SQL y poner cada unidad completa en una sola linea, la misma prueba paso. Una revision independiente comprobo que los 1.430 tokens SQL son identicos y que solo cambio el whitespace.

## RED / GREEN

RED inicial:

```text
node --test test/migrations.wrangler.test.mjs
1 failed: faltaba notifications_item_deleted tras ejecutar el resultado del splitter de Wrangler.
```

RED definitivo, con la frontera Workerd y el payload bruto:

```text
npx vitest run test/migrations.integration.test.ts
D1_EXEC_ERROR: Error in line 1: CREATE TABLE notifications (: incomplete input: SQLITE_ERROR
```

GREEN definitivo:

```text
npm run api:test
Node test: 1 passed
Vitest: 5 test files passed, 37 tests passed

npx --workspace @nfcompra/api tsc --noEmit
exit 0

git diff --check
exit 0
```

La prueba Node construye el payload de Wrangler con el `INSERT INTO d1_migrations`, exige once fragmentos y verifica los seis triggers y el registro de 0006. La prueba Workers aplica 0001-0005 y ejecuta el archivo 0006 bruto por `env.DB.exec`, comprobando esquema, indices, seis triggers y seis registros de migracion.

## Cambios

- `apps/api/migrations/0006_notifications.sql`: mismas diez sentencias y misma funcionalidad, formateadas como una sentencia completa por linea para el limite remoto D1.
- `apps/api/test/migrations.wrangler.node-test.mjs`: regresion con `unstable_splitSqlQuery`, SQLite real, once fragmentos, seis triggers y registro de migracion.
- `apps/api/test/migrations.integration.test.ts` y `apps/api/vitest.config.ts`: regresion del payload bruto mediante `D1Database.exec()` de Workerd.
- `apps/api/package.json`: incorpora la regresion Node al comando de pruebas de API.
- `README.md`: refleja el estado verificado de las seis migraciones y documenta el comando confirmado, sin identificadores ni secretos.

## Operacion remota autorizada

Comando de aplicacion:

```powershell
npx wrangler d1 migrations apply nfcompra-production --remote --config apps/api/wrangler.production.jsonc
```

Un reintento con la correccion provisional del splitter fallo con `incomplete input: SQLITE_ERROR [code: 7500]`. Tras la reproduccion Workerd, la correccion definitiva y la segunda revision, el mismo comando termino con:

```text
Executed 11 commands in 2.90ms
0006_notifications.sql | ✅
```

Verificaciones prescritas:

```powershell
npx wrangler d1 migrations list nfcompra-production --remote --config apps/api/wrangler.production.jsonc
npx wrangler d1 execute nfcompra-production --remote --config apps/api/wrangler.production.jsonc --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

Resultado exacto relevante:

```text
✅ No migrations to apply!
notifications
success: true
changes: 0
rows_written: 0
```

## Commit

Reparacion, pruebas y README:

```text
b04be5a67488c4ec70c4d88f8946c742e075db33 fix(api): make notification migration D1-compatible
```

Este informe se registra en un commit documental posterior para poder incluir el hash inmutable de la reparacion.

## Preocupaciones restantes

- El Worker y los clientes siguen sin desplegar; esta tarea solo preparo y verifico D1, de acuerdo con el alcance autorizado.
- La compatibilidad depende de conservar cada sentencia compuesta de 0006 en una sola linea. Las dos regresiones impiden reintroducir el formato incompatible sin fallo local.
