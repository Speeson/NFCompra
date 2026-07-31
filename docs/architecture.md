# Arquitectura

## Componentes

- `apps/api` es un Worker con rutas versionadas `/v1`, autenticación y D1 para hogares, listas, invitaciones y notificaciones.
- `apps/web` es la PWA React que consume el mismo contrato con datos autenticados en memoria y una continuación de invitación limitada a la sesión del navegador.
- `apps/android` es el cliente Compose con un módulo de colaboración; la aceptación desde enlace profundo mantiene el token solo en memoria de la actividad.

La API es el límite de autorización. Las vistas de PWA y Android pueden ocultar acciones de propietario, pero el Worker vuelve a comprobar pertenencia y rol en cada ruta.

## Invitaciones y membresía

Una invitación normaliza el correo destinatario, persiste únicamente el hash de un token aleatorio y caduca a los siete días. Al aceptarla, D1 actualiza la invitación y añade la membresía dentro del mismo lote. La alternativa de aceptación por identificador permite que una notificación abra una acción segura sin reconstruir ni exponer el token recibido por correo.

El propietario administra invitaciones y bajas; cualquier miembro puede leer el roster. La API nunca devuelve el token de invitación en JSON.

## Persistencia y entrega de notificaciones

La migración `0006_notifications.sql` persiste una fila por notificación con propietario, tipo, texto mínimo y contexto opcional de hogar, lista e invitación. Los triggers de D1 producen eventos de invitación, aceptación, baja de miembro y cambios de productos dentro de la operación de datos que los causa. Así una operación idempotente repetida no genera una notificación adicional.

La actividad de lista conserva como clave de agrupación el destinatario, autor, lista y tipo. Durante cinco minutos una nueva actividad del mismo grupo actualiza la notificación no leída existente; un lector, otro autor, otra lista u otro tipo abre un grupo distinto. La persona que realiza el cambio queda excluida de las notificaciones de esa actividad.

Las invitaciones y bajas no comparten grupo con actividad de lista. El listado, contador y marcado de lectura se consultan siempre por el usuario autenticado, por lo que una cuenta no puede leer ni marcar las notificaciones de otra.

## Clientes y límites del hito 3A

PWA y Android muestran un contador y panel de notificaciones, permiten marcar una o todas como leídas y navegan con los IDs de contexto disponibles. La PWA consulta mientras el documento está visible; Android refresca al entrar y al volver a primer plano solo si la sesión continúa autenticada.

El hito 3A no añade push, WebSockets, workers en segundo plano, Room ni cola de mutaciones. La sincronización offline pertenece explícitamente al hito 3B.

## Persistencia offline del hito 3B

La PWA guarda en IndexedDB solamente la última respuesta correcta de productos, separada por usuario autenticado y lista. Ante un fallo de lectura sin conexión puede presentar esa instantánea en modo de solo lectura: no crea una cola web ni permite mutaciones. Una respuesta posterior correcta sustituye la instantánea y abandona el modo de solo lectura; el cierre de sesión borra las instantáneas de esa persona. Ni tokens ni datos de invitaciones entran en IndexedDB.

Android usa Room como fuente local de hogares, listas, productos y operaciones pendientes, aislada por cuenta; las credenciales permanecen en Android Keystore. Una mutación de producto actualiza la proyección Room y persiste una operación con `operationId`; WorkManager programa trabajo único que espera conectividad. El Worker procesa las operaciones de una en una en su orden de creación. Al confirmar una respuesta, actualiza la proyección y borra solo esa operación de forma transaccional. Ante `409 ITEM_VERSION_CONFLICT`, guarda la versión del servidor y conserva la intención local hasta que la persona elige usar el servidor o reintentar su cambio con una nueva operación.
