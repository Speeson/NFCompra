# NFCompra — Diseño del hito 3B: consulta y sincronización offline

## Alcance

El hito 3B completa el trabajo offline de NFCompra. La PWA podrá consultar sin conexión la última lista obtenida correctamente, en modo de solo lectura. Android será offline-first: mostrará datos locales, aceptará mutaciones sin red y las sincronizará al recuperar conectividad.

No se añaden WebSockets, notificaciones push, NFC, App Links verificados, despliegues ni una cola de mutaciones offline para la PWA.

## PWA: consulta offline de solo lectura

La PWA guarda en IndexedDB una instantánea de cada lista obtenida correctamente, aislada por usuario autenticado y lista. Cuando la API no está disponible, carga la última instantánea existente y muestra un indicador accesible de “Sin conexión”. En ese estado se deshabilitan todas las mutaciones de hogares, listas y productos; no se encolan ni se simulan cambios.

Al recuperar conectividad o al volver a estar visible, la PWA solicita de nuevo la lista al servidor. Una respuesta correcta actualiza tanto la pantalla como la instantánea de IndexedDB. La caché se elimina al cerrar sesión y nunca mezcla datos entre usuarios.

## Android: Room como fuente de verdad local

Android añade Room con entidades para hogares, listas, productos y operaciones pendientes. La pantalla consulta Room, por lo que muestra de inmediato el último estado sincronizado incluso sin red. Las respuestas correctas de API se escriben en Room antes de mostrarse; la sesión y los tokens siguen fuera de Room y mantienen su almacenamiento seguro actual.

Cada mutación de producto actualiza Room primero y crea una operación pendiente con UUID `operationId`, tipo, payload serializado, orden de creación, intentos, estado y fecha. La misma operación conserva su identificador en todos los reintentos para aprovechar la idempotencia existente de la API.

## Sincronización y conflictos Android

Un `SyncWorker` de WorkManager se ejecuta solo con red disponible. Procesa las operaciones de una en una y por orden de creación. Si la API confirma la operación, actualiza Room con la respuesta y elimina la operación. Un error temporal incrementa sus intentos y aplica el backoff de WorkManager; un error de validación permanente queda visible como fallo local sin reintentos automáticos.

Ante `409 ITEM_VERSION_CONFLICT`, la operación queda en estado `conflict` junto con el producto actual del servidor. La interfaz presenta el cambio local y el remoto y permite dos opciones explícitas: aceptar el servidor, lo que actualiza Room y descarta la operación; o reintentar el cambio local, que crea una operación nueva con la versión actual del servidor y conserva un nuevo `operationId`.

El Worker sigue siendo la autoridad de datos. No se añaden rutas API ni se cambia el contrato de versiones, conflictos o idempotencia.

## Experiencia y estados

La PWA muestra un aviso de conectividad y controles no editables cuando lee la caché. Android muestra que una modificación está pendiente, sincronizando, fallida o en conflicto sin bloquear la consulta de la lista. La resolución de conflicto es accesible y no descarta un cambio local sin una acción explícita de la persona usuaria.

Al recuperar red, Android agenda la sincronización y refresca los datos remotos afectados. La PWA vuelve a consultar y sustituye su caché; ambas plataformas mantienen los mecanismos de sondeo visibles ya existentes.

## Pruebas y aceptación

Las pruebas PWA cubren guardado y recuperación de IndexedDB, aislamiento por usuario, indicador offline, controles deshabilitados, limpieza al cerrar sesión y recuperación al volver la red.

Las pruebas Android cubren DAOs y migraciones Room, aplicación local de mutaciones, orden e idempotencia de cola, respuesta temporal, error permanente, `409`, ambas decisiones de resolución y programación del Worker. También comprueban que una lista cacheada se muestra sin red y que el APK de depuración compila.

Se acepta el hito cuando la PWA consulta una lista previa sin red sin permitir editarla, y Android puede modificar la lista sin red, cerrar/abrir la aplicación, recuperar conectividad y sincronizar cada cambio exactamente una vez o pedir una resolución explícita de conflicto.
