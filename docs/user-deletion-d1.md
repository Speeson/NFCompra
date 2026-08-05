# Borrado seguro de usuarios en D1

No borres directamente de `users` si el usuario tiene datos asociados. La base usa claves foráneas y algunas relaciones no tienen `ON DELETE CASCADE` porque conservan autoría o propiedad:

- `households.owner_id -> users.id`
- `invitations.invited_by -> users.id`
- `shopping_items.created_by -> users.id`
- `shopping_items.updated_by -> users.id`
- `nfc_links.created_by -> users.id`

Las tablas que sí caen en cascada desde `users` son `auth_tokens`, `refresh_tokens`, `household_members`, `notifications` como usuario destino y `sync_operations`.

## Opción recomendada para uso personal

Si se quiere eliminar completamente un usuario y todos sus hogares propios, hacerlo con una transacción controlada:

```sql
BEGIN TRANSACTION;

-- Sustituye estos valores antes de ejecutar.
-- :user_id = usuario a borrar
-- :fallback_user_id = usuario existente que conservará autoría histórica si hace falta

DELETE FROM invitations
WHERE invited_by = :user_id
   OR household_id IN (SELECT id FROM households WHERE owner_id = :user_id);

DELETE FROM nfc_links
WHERE created_by = :user_id
   OR household_id IN (SELECT id FROM households WHERE owner_id = :user_id);

DELETE FROM households
WHERE owner_id = :user_id;

UPDATE shopping_items
SET created_by = :fallback_user_id
WHERE created_by = :user_id;

UPDATE shopping_items
SET updated_by = :fallback_user_id
WHERE updated_by = :user_id;

DELETE FROM users
WHERE id = :user_id;

COMMIT;
```

Si no existe un usuario de sustitución, primero hay que crearlo o convertir estas relaciones a `ON DELETE SET NULL` con una migración específica.
