# Borrado seguro de usuarios en D1

No borres directamente de `users`. La base tiene claves foraneas y triggers, y el orden manual puede fallar con `SQLITE_CONSTRAINT_FOREIGNKEY`.

Usa el servicio implementado en `apps/api/src/account-deletion/service.ts`.

## Usuario

La app llama a:

```http
DELETE /v1/me
```

con:

```json
{ "currentPassword": "actual" }
```

## Administrador local

Previsualiza impacto sin cambios:

```sh
npm run admin:delete-user -- usuario@example.com --dry-run
```

Borrado local real, con confirmacion interactiva:

```sh
npm run admin:delete-user -- usuario@example.com
```

Produccion requiere decision explicita:

```sh
npm run admin:delete-user -- usuario@example.com --remote --dry-run
```

No ejecutes el borrado remoto real sin revisar antes el dry-run.

## Regla de propiedad

- Si el usuario es miembro, se elimina su membresia.
- Si es propietario y hay otros miembros activos, el nuevo propietario es el miembro mas antiguo por `household_members.created_at ASC, user_id ASC`.
- Si es propietario unico, el hogar se elimina con sus datos dependientes.
- Las referencias historicas de autoria en `shopping_items` y `nfc_links` pasan a `NULL` tras la migracion `0014_account_deletion_author_nullable.sql`.
