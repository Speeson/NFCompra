# NFCompra — Diseño del hito 3A: hogares compartidos y notificaciones

## Alcance

El hito 3 se divide en dos entregas. Este documento define el hito 3A: hogares compartidos, invitaciones por correo, administración de miembros y notificaciones internas. El hito 3B cubrirá la consulta offline de la PWA y la sincronización offline-first de Android con Room y WorkManager.

No se añaden notificaciones push, WebSockets, enlaces NFC ni despliegues en esta entrega.

## Invitaciones y miembros

Solo una persona con rol `owner` puede invitar, revocar invitaciones o eliminar miembros de un hogar. Una invitación se dirige a una dirección de correo concreta y se representa con un token aleatorio, no secuencial, de un solo uso y válido durante siete días.

La API no permite invitar a una persona que ya pertenece al hogar. Solo puede existir una invitación pendiente por pareja hogar-email; volver a invitar renueva la invitación existente de forma explícita y deja inutilizable su token anterior. Aceptar exige una cuenta verificada cuyo correo coincida con el de la invitación. La aceptación crea la membresía y consume la invitación en una única operación lógica.

Una invitación consumida, revocada o caducada nunca vuelve a ser aceptable. El propietario puede consultar y revocar las invitaciones pendientes. Puede eliminar a otros miembros, pero no eliminarse a sí mismo ni dejar el hogar sin propietario.

## Contrato y persistencia

La API añade una entidad de invitación con hogar, correo normalizado, token persistido como hash, estado, caducidad, emisor y marcas temporales. Sus rutas cubren crear/listar/revocar invitaciones por hogar y aceptar una invitación mediante token.

La API también expone miembros del hogar y la eliminación de un miembro. Todas estas rutas verifican sesión, pertenencia y rol antes de revelar o modificar datos.

Las notificaciones se persisten por destinatario y contienen tipo, estado leído/no leído, fecha y un contexto mínimo navegable (`householdId`, `listId` o `invitationId` cuando corresponde). La API permite listar las recientes, consultar el número de no leídas y marcar una o todas como leídas.

## Notificaciones internas

PWA y Android muestran una campana con contador de no leídas y un panel de notificaciones recientes. Tocar una notificación la marca leída y abre el contexto disponible: aceptación de invitación, hogar o lista.

Se generan notificaciones para la persona destinataria de una invitación, para quien invitó cuando se acepta, para una persona expulsada del hogar y para cambios remotos en listas compartidas: producto añadido, editado, marcado o eliminado. No se generan notificaciones para la acción propia.

Para evitar ruido, los cambios de lista se agrupan por destinatario, autor, lista y tipo dentro de una ventana corta definida por la API. La invitación conserva prioridad y enlaza directamente al flujo de aceptación.

No hay push en este hito. Ambos clientes refrescan las notificaciones al abrir o volver a estar visibles y mediante sondeo ligero mientras permanecen activos.

## Experiencia de cliente

La PWA y Android incorporan una sección de miembros del hogar. Un propietario puede introducir un correo, enviar o renovar una invitación, consultar pendientes, revocarlas y eliminar miembros permitidos. Los miembros no propietarios pueden ver la composición del hogar sin administrar a otros.

El enlace de invitación abre una pantalla de aceptación. Si no existe sesión, el cliente conserva el destino durante login o registro. Si la cuenta no está verificada, se dirige a la verificación. Cuando el correo autenticado no coincide, el cliente comunica que la invitación no corresponde a esa cuenta sin revelar el nombre ni otros datos del hogar.

Tras aceptar, los dos miembros consultan y editan las mismas listas. La PWA mantiene su actualización visible periódica; Android recarga al entrar o volver a la pantalla. La disponibilidad sin conexión se aborda únicamente en 3B.

## Errores y seguridad

Los tokens de invitación no se registran en texto claro ni se devuelven por rutas administrativas. Los enlaces de correo usan el dominio público previsto de NFCompra. La API devuelve errores de dominio claros para token inválido, caducado, revocado, consumido, correo no coincidente y permisos insuficientes, sin filtrar datos del hogar a quien no pertenece.

Crear, aceptar, revocar o eliminar debe ser idempotente cuando el cliente reintente una mutación. Los cambios de miembros e invitaciones son atómicos respecto a sus notificaciones asociadas.

## Pruebas y aceptación

Las pruebas API cubren dos usuarios verificados, autorización cruzada, propiedad, renovación, caducidad, revocación, token de un solo uso y coincidencia de correo. También cubren que los eventos de lista creen notificaciones solo para otros miembros y que la agrupación no mezcle listas, autores o tipos.

Las pruebas web cubren gestión de miembros, aceptación con redirección de sesión y la campana. Las pruebas Android cubren repositorios, ViewModels y pantallas para las mismas acciones. La entrega se acepta cuando un propietario invita a otro usuario, este acepta desde cualquiera de los dos clientes, ambos usan el mismo hogar y las notificaciones internas reflejan las acciones remotas sin generar avisos propios.
