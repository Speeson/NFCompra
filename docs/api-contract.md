# Contrato de API `/v1`

Este documento describe el contrato HTTP actualmente implementado para hogares compartidos, invitaciones y notificaciones internas. Todas las rutas de esta página requieren `Authorization: Bearer <access-token>` salvo que se indique lo contrario. Los identificadores y las fechas se muestran como marcadores; las fechas reales son ISO 8601.

Los errores siguen esta envoltura:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "...",
    "details": {}
  }
}
```

## Perfil

`GET /v1/me` devuelve la cuenta autenticada:

```json
{
  "user": {
    "id": "user-123",
    "name": "Ana Garcia",
    "firstName": "Ana",
    "lastName": "Garcia",
    "birthDate": "1995-04-23",
    "username": "ana",
    "email": "ana@example.test",
    "emailVerifiedAt": "2026-07-27T12:00:00.000Z",
    "createdAt": "2026-07-27T12:00:00.000Z",
    "updatedAt": "2026-07-27T12:00:00.000Z"
  }
}
```

`PATCH /v1/me` actualiza parcialmente `firstName`, `lastName` y `username`. `email` es de solo lectura. `firstName` no puede quedar vacio; `username` puede ser `null` o una cadena unica de 3 a 30 caracteres (`a-z`, `A-Z`, `0-9`, `.`, `_`, `-`). Un username ocupado responde `409 USERNAME_ALREADY_REGISTERED`.

```json
{ "firstName": "Ana", "lastName": "Garcia", "username": "ana" }
```

`POST /v1/me/change-password` cambia la contrasena de la cuenta autenticada:

```json
{ "currentPassword": "actual", "newPassword": "nueva-segura" }
```

La contrasena nueva debe tener al menos 8 caracteres. Si la contrasena actual no coincide responde `401 INVALID_CURRENT_PASSWORD`. El cambio no cierra la sesion actual ni invalida sesiones existentes.

`DELETE /v1/me` elimina la cuenta autenticada. Requiere contrasena actual:

```json
{ "currentPassword": "actual" }
```

Responde `200 { "status": "deleted" }`. Si la contrasena no coincide responde `401 INVALID_CURRENT_PASSWORD` y no modifica datos. El borrado transfiere cada hogar propio al miembro activo mas antiguo por `household_members.created_at ASC, user_id ASC`; si no hay otro miembro activo, elimina el hogar. Las referencias de autoria en productos de listas y enlaces NFC se conservan como `null` para no borrar datos compartidos.

## Invitaciones

### Crear o renovar

`POST /v1/households/{householdId}/invitations` solo está disponible para el propietario del hogar. Normaliza el correo y crea, o renueva, la invitación pendiente para ese correo. La invitación caduca siete días después de la creación o renovación. El token se entrega solo mediante el enlace externo de correo: nunca forma parte de esta respuesta ni de otra respuesta JSON.

```json
{ "email": "bea@example.test" }
```

Respuesta `201`:

```json
{
  "invitation": {
    "id": "inv-123",
    "householdId": "home-123",
    "email": "bea@example.test",
    "status": "pending",
    "expiresAt": "2026-08-03T12:00:00.000Z",
    "invitedBy": "user-owner",
    "createdAt": "2026-07-27T12:00:00.000Z"
  }
}
```

### Listar y revocar

`GET /v1/households/{householdId}/invitations` es solo de propietario y responde `{ "invitations": [Invitation] }`. `DELETE /v1/households/{householdId}/invitations/{invitationId}` es también solo de propietario y responde `200 { "status": "revoked" }` para una invitación pendiente. Una invitación inexistente, no pendiente o de otro hogar responde `404 NOT_FOUND`.

### Aceptar

`POST /v1/invitations/accept` recibe el token que la persona obtuvo en el enlace externo:

```json
{ "token": "<token-recibido-por-correo>" }
```

Como alternativa segura para una notificación, `POST /v1/invitations/{invitationId}/accept` no lleva cuerpo y solo puede aceptarla la cuenta verificada cuyo correo coincide con la invitación. Ambas respuestas correctas son `200`:

```json
{
  "householdId": "home-123",
  "invitation": {
    "id": "inv-123",
    "householdId": "home-123",
    "email": "bea@example.test",
    "status": "accepted",
    "expiresAt": "2026-08-03T12:00:00.000Z",
    "invitedBy": "user-owner",
    "createdAt": "2026-07-27T12:00:00.000Z"
  }
}
```

La cuenta debe tener el correo verificado. El token se persiste como hash y es de un solo uso.

## Miembros

`GET /v1/households/{householdId}/members` está disponible para cualquier miembro del hogar y responde:

```json
{
  "members": [
    {
      "userId": "user-owner",
      "name": "Ana",
      "email": "ana@example.test",
      "role": "owner",
      "createdAt": "2026-07-27T12:00:00.000Z"
    }
  ]
}
```

`DELETE /v1/households/{householdId}/members/{userId}` es solo de propietario y responde `200 { "status": "removed" }`. No se puede eliminar a la propia cuenta (`409 CANNOT_REMOVE_SELF`); una persona que no sea miembro eliminable responde `404 NOT_FOUND`.

## Notificaciones internas

Las notificaciones son internas, persistentes y pertenecen exclusivamente a la cuenta autenticada.

`GET /v1/notifications?limit=20` devuelve las más recientes. `limit` es opcional, entero entre 1 y 50, y por defecto vale 20.

```json
{
  "notifications": [
    {
      "id": "notice-123",
      "type": "item_created",
      "title": "Producto añadido",
      "body": "Se ha añadido un producto a una lista compartida.",
      "householdId": "home-123",
      "listId": "list-123",
      "invitationId": null,
      "readAt": null,
      "createdAt": "2026-07-27T12:01:00.000Z"
    }
  ]
}
```

Los tipos actuales son `invitation_received`, `invitation_accepted`, `member_removed`, `item_created`, `item_updated`, `item_checked` e `item_deleted`. Los identificadores de hogar, lista e invitación sirven para navegar al contexto; no contienen secretos de aceptación.

- `GET /v1/notifications/unread-count` responde `{ "count": 3 }`.
- `PATCH /v1/notifications/{notificationId}/read` responde `200 { "status": "read" }` para una notificación de la propia cuenta; un identificador ajeno o inexistente responde `404 NOT_FOUND`.
- `POST /v1/notifications/read-all` responde `200 { "status": "read" }` y marca como leídas las notificaciones no leídas de la cuenta actual.

## Autorización y errores

| Situación | Estado y código |
| --- | --- |
| Sin sesión o token no válido en las rutas protegidas descritas en este documento | `401 UNAUTHORIZED` |
| Consultar miembros sin pertenecer al hogar | `403 FORBIDDEN` |
| Gestionar invitaciones, revocar o eliminar miembros sin ser propietario | `403 FORBIDDEN` |
| Aceptar con cuenta sin correo verificado | `403 EMAIL_NOT_VERIFIED` |
| Aceptar una invitación destinada a otro correo | `403 INVITATION_EMAIL_MISMATCH` |
| Correo o cuerpo no válido; límite de notificaciones fuera de 1–50 | `422 VALIDATION_ERROR` |
| Invitar a una persona que ya pertenece al hogar | `409 ALREADY_HOUSEHOLD_MEMBER` |
| El propietario intenta eliminarse | `409 CANNOT_REMOVE_SELF` |
| Token desconocido, expirado, revocado o ya usado | `400 INVALID_INVITATION_TOKEN`, `INVITATION_EXPIRED`, `INVITATION_REVOKED` o `INVITATION_ALREADY_ACCEPTED` |
| Recurso, ruta o notificación ajena inexistente | `404 NOT_FOUND` |
| Fallo al entregar el correo de invitación | `503 EMAIL_DELIVERY_FAILED` |

Las rutas de listas verifican que la cuenta sea miembro del hogar o de la lista antes de listar o mutar datos, y responden `403 FORBIDDEN` cuando no lo sea. Las mutaciones de productos validan el cuerpo (`422 VALIDATION_ERROR`), detectan versiones obsoletas (`409 ITEM_VERSION_CONFLICT`) y preservan la idempotencia mediante `operationId` (`409 OPERATION_IN_PROGRESS`, `OPERATION_ID_REUSED` u `OPERATION_LOST` cuando corresponda).

El sincronizador offline de Android consume este contrato existente: conserva cada `operationId` mientras reintenta una operación y usa la versión devuelta en `ITEM_VERSION_CONFLICT` para una resolución explícita. No introduce rutas, cabeceras ni campos HTTP adicionales.
