# Task 2 critical fix report

## Estado

Correcciones C1, I1, I2 e I3 implementadas mediante TDD en el worktree `hito3b`. El alcance sigue limitado a la base offline de Task 2: no se ha incorporado ejecución de cola, WorkManager ni resolución de conflictos de Task 3.

## C1: aislamiento de tokens entre sesiones

### Causa

El autenticador comparaba solo el token de acceso del 401 con los tokens globales actuales. Si el 401 de A llegaba después de iniciar B, reintentaba la petición de A con el token de B. Si una renovación de A ya estaba en vuelo, guardaba su respuesta sin compare-and-set y podía reemplazar la sesión B.

### Corrección

- `TokenStore` expone un `SessionSnapshot` con identidad opaca y tokens.
- El interceptor vincula cada petición autenticada a esa identidad mediante un tag de OkHttp.
- El autenticador solo comparte un resultado de refresh dentro de la misma identidad.
- La renovación persiste mediante `compareAndSave`; si la identidad o los tokens cambiaron, no guarda ni reintenta.
- La limpieza por error, la renovación explícita y el logout usan `compareAndClear`, por lo que una operación tardía no borra otra sesión.
- La identidad se conserva durante la rotación de tokens de una sesión y cambia en login/save o clear.
- El login captura la generación incluso desde el estado anónimo y solo publica tokens con `compareAndStart`; respuestas de login reordenadas y fallos de almacenamiento no sobrescriben ni limpian una sesión posterior.
- La persistencia cifrada captura los valores anteriores y los restaura si `SharedPreferences.commit()` falla, evitando que su mutación previa del mapa en memoria pueda resucitar una sesión no confirmada.

### RED/GREEN

La regresión usa MockWebServer, dos clientes reales y dos peticiones de A. Una queda dentro de un refresh retrasado; la otra recibe su 401 después de `clear` y `save` de B. Antes de la corrección falló porque la petición antigua obtuvo `200` tras reintentarse con B. Después, ambas terminan en `401`, solo se observan las dos cabeceras `Bearer access-a` originales y el almacén conserva `access-b`/`refresh-b`.

Comando focal:

```powershell
.\gradlew.bat :feature:auth:testDebugUnitTest --tests "*AuthRepositoryTest.delayed account A 401 and refresh cannot use or replace account B session"
```

Resultado GREEN: `BUILD SUCCESSFUL`.

La revisión final detectó el mismo riesgo en el login incondicional. Se añadieron dos regresiones: dos respuestas de login reordenadas y un fallo de persistencia que coincide con el guardado de B. Ambas fallaron con `save`/`clear` incondicionales y pasan con el CAS de generación.

Una segunda revisión detectó que `SharedPreferences.Editor.commit()` puede devolver `false` después de actualizar el mapa en memoria. La prueba `SessionTokenPersistenceTest` falló primero por ausencia de la protección y pasa tras añadir snapshot y rollback tanto para guardado como para borrado.

Comando focal:

```powershell
.\gradlew.bat :core:network:testDebugUnitTest --tests "*SessionTokenPersistenceTest*"
```

Resultado GREEN: `BUILD SUCCESSFUL`.

## I1: resultado público desde Room

### Causa

`households()` y `lists()` escribían el snapshot remoto en Room, donde el DAO lo fusionaba con padres protegidos por operaciones pendientes, pero devolvían directamente la lista remota sin fusionar.

### Corrección

Después de cada reemplazo correcto, ambos métodos consultan el DAO y construyen su resultado desde el estado Room ya fusionado.

### RED/GREEN

Dos regresiones cargan hogar/lista/producto local con una operación pendiente y reciben snapshots remotos vacíos. En RED ambos resultados públicos estaban vacíos aunque Room retuviera las filas; en GREEN devuelven `home-1` y `list-1` desde Room.

## I2: metadatos coherentes con cascadas

### Causa

Las claves foráneas eliminaban listas y productos al borrar su padre, pero `snapshot_metadata` no tenía relación ni poda equivalente. Una clave `items:<listId>` huérfana hacía que un primer fallo de transporte pareciera un snapshot vacío válido.

### Corrección

Los reemplazos transaccionales de snapshot completo, hogares y listas podan claves `lists:*` sin hogar y `items:*` sin lista antes de escribir la frescura de la colección actual.

### RED/GREEN

- RED DAO: al borrar un hogar o lista, las claves hijas seguían presentes.
- RED repositorio: el fallo de productos posterior a borrar su lista se ocultaba como caché vacía.
- GREEN: las claves hijas desaparecen en la misma transacción y el fallo se propaga como `IOException`.

## I3: propiedad compartida de Room

### Causa

El registro devolvía la misma instancia para una cuenta, pero no contaba adquisiciones. La primera sesión que llamaba a `release` eliminaba y cerraba una base aún usada por otra.

### Corrección

El registro guarda `DatabaseReference(database, owners)`: cada adquisición de la misma cuenta incrementa `owners` y solo la liberación que lo reduce a cero elimina y cierra Room. Una factoría interna permite probar el registro con Room en memoria sin depender del filesystem simulado de Robolectric; el camino persistente de producción sigue usando `Room.databaseBuilder` y la migración registrada.

### RED/GREEN

La regresión adquiere dos propietarios del mismo nombre, libera el primero y consulta con el segundo. Con la semántica anterior revalidada por mutación, falló al encontrar la base cerrada; restaurado el ref-count, la consulta funciona y la segunda liberación cierra la instancia.

## Migración Room 1 a 2

Se añadió una prueba ejecutable con `MigrationTestHelper` y los esquemas exportados. Crea una base v1, inserta hogar, lista, producto y operación pendiente, ejecuta `MIGRATION_1_2`, valida todo el esquema v2, comprueba que los datos permanecen y que `snapshot_metadata` existe vacía.

Comando focal:

```powershell
.\gradlew.bat :core:database:testDebugUnitTest --tests "*NfCompraDatabaseMigrationTest*"
```

Resultado: `BUILD SUCCESSFUL`.

## Verificación completa

Se ejecutó sin reutilizar resultados:

```powershell
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :core:network:testDebugUnitTest :core:database:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug --rerun-tasks
```

Resultado:

- `BUILD SUCCESSFUL`.
- 215 tareas ejecutadas.
- 72 pruebas unitarias, 0 fallos, 0 errores y 0 omitidas.
- `:feature:shoppinglist:compileDebugAndroidTestKotlin` y `:feature:sharing:compileDebugAndroidTestKotlin` correctas.
- APK debug ensamblado.
- Único aviso: `libandroidx.graphics.path.so` se empaqueta sin strip, ya conocido y no bloqueante.
- `git diff --check`: código 0; solo avisos de normalización LF/CRLF del checkout Windows.

## Límites conservados

- No se ejecuta ni planifica ninguna operación pendiente.
- No se añadieron WorkManager, backoff, sincronizador ni UI de conflictos.
- No cambiaron endpoints ni contratos HTTP.
- No se guardan tokens en Room.
- No hubo push, PR, despliegue ni operación remota.

## Revisión

La primera revisión read-only no encontró Critical. Su Important fue el guardado/limpieza incondicional del login; se reprodujo en RED, se sustituyó por CAS desde la generación capturada y las regresiones quedaron GREEN. También se aplicaron sus defensas menores: el refresh explícito rechaza tokens vacíos y la prueba de migración conserva hogar, lista, producto y operación pendiente.

La segunda revisión señaló la mutación en memoria previa al `false` de `SharedPreferences.commit()`. Tras implementar y verificar el rollback, la revisión final no encontró defectos Critical/Important y emitió veredicto `Ready: yes`.
