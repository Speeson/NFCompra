# Hito 3B final fix report

Fecha: 2026-07-31

Base revisada: `75fbee9`

Alcance: correcciones finales C1, I1 e I2 de Android offline-first.

## Resultado

- C1: `KeystoreTokenStore` es ahora una fachada sobre un almacén de sesión compartido por `applicationContext`. Las instancias creadas antes y después de recrear una actividad comparten el mismo lock, generación CAS y `StateFlow`. La regresión con dos fachadas verifica que un snapshot antiguo no puede ejecutar ni `compareAndSave` ni `compareAndClear` sobre la sesión nueva persistida.
- I1: cerrar `AccountShoppingSession` libera ViewModel, colectores, operaciones del repositorio y la referencia Room, pero no cancela WorkManager. `revoke()` y la detección de cambio o desaparición de una cuenta confirmada cancelan explícitamente el trabajo único de la cuenta anterior. Un refresh que falla por transporte conserva la sesión y no dispara esa cancelación; un `401` confirmado sí publica la sesión anónima. Las pruebas de WorkManager distinguen cierre de la última interfaz y revocación real, incluida una cadena activa con sucesor.
- I2: `OfflineShoppingRepository` expone snapshots locales de hogares y listas solo cuando existe su metadata de colección. `ShoppingListViewModel` publica esa selección y el flujo Room antes de esperar las llamadas remotas; la carga conectada continúa y converge después sobre los datos del servidor.

## Evidencia TDD

### C1

RED:

```text
:core:network:compileDebugUnitTestKotlin FAILED
Unresolved reference 'SessionCipher'
Too many arguments for 'constructor(context: Context): KeystoreTokenStore'
```

GREEN:

```text
.\gradlew.bat :core:network:testDebugUnitTest --tests "*KeystoreTokenStoreTest*"
BUILD SUCCESSFUL
```

La revisión independiente detectó después un caso ABA cuando un refresh correcto persistía exactamente el mismo par de tokens. La regresión se amplió primero y falló porque el snapshot anterior todavía podía borrar la sesión; `compareAndSave` incrementa ahora la identidad también en ese caso. La misma prueba con `--rerun-tasks` terminó en `BUILD SUCCESSFUL` tras la corrección.

### I1

RED:

```text
:feature:shoppinglist:compileDebugUnitTestKotlin FAILED
Unresolved reference 'revokeShoppingAccount'
```

La expectativa de cierre de interfaz también se invirtió para exigir que el trabajo no termine en `CANCELLED`.

GREEN:

```text
.\gradlew.bat :feature:shoppinglist:testDebugUnitTest --tests "*OperationSynchronizerTest*UI*" --tests "*OperationSynchronizerTest*logout*"
BUILD SUCCESSFUL
```

La revisión independiente detectó que el autenticador también borraba la sesión ante una desconexión transitoria durante el refresh. La prueba con `SocketPolicy.DISCONNECT_AT_START` falló primero porque el `StateFlow` quedó anónimo. Tras limitar `compareAndClear` a un HTTP `401` confirmado, la prueba focalizada con `--rerun-tasks` terminó en `BUILD SUCCESSFUL`; las regresiones existentes conservan el borrado para `401`.

### I2

RED:

```text
AccountShoppingSessionTest > cold launch renders the Room snapshot while the network refresh is still delayed FAILED
kotlinx.coroutines.TimeoutCancellationException
```

GREEN:

```text
.\gradlew.bat :feature:shoppinglist:testDebugUnitTest --tests "*AccountShoppingSessionTest*cold launch*"
BUILD SUCCESSFUL
```

La prueba usa Room en memoria, retiene la respuesta de `/v1/households`, observa primero `Leche guardada` y, tras liberar la red, observa `Pan remoto` y el título remoto.

## Verificación completa

Android, desde `apps/android` con `ANDROID_HOME` configurado:

```text
.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
BUILD SUCCESSFUL (215 actionable tasks)
```

API y PWA, desde la raíz:

```text
npm run api:test
4 test files, 36 tests passed

npx --workspace @nfcompra/api tsc --noEmit
exit 0

npm --workspace @nfcompra/web run test
7 test files, 43 tests passed

npm --workspace @nfcompra/web run typecheck
exit 0

npm --workspace @nfcompra/web run build
vite build completed; PWA service worker generated
```

No se ejecutaron operaciones remotas, despliegues ni uso de credenciales externas.

## Revisión

La revisión independiente final no encontró incidencias Critical ni Important pendientes después de las correcciones ABA y de refresh transitorio.
