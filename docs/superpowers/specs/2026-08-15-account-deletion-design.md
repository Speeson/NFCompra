# Account deletion design

## Objective

Implement safe account deletion for self-service users and local administrators. Both entry points reuse the same backend account-deletion service so ownership transfer, cleanup order, and impact reporting stay consistent.

## Approved design

- `DELETE /v1/me` requires the authenticated user's current password and returns no deleted user data.
- Android and Web expose `Eliminar cuenta` from account/profile settings with a current-password confirmation dialog.
- Admin deletion is a local npm command with dry-run by default-friendly safety: local DB by default, explicit confirmation for mutations, and explicit `--remote` for production.
- Owned households transfer to the oldest active member by `household_members.created_at ASC, user_id ASC`; owner-only households are deleted.

## Architecture

- API adds `AccountDeletionService` under `apps/api/src/account-deletion/`.
- The service audits and mutates `users`, `auth_tokens`, `refresh_tokens`, `sync_operations`, `households`, `household_members`, `invitations`, `notifications`, `shopping_lists`, `shopping_items`, `nfc_links`, and `user_product_favorites`.
- Shared/catalog products and categories survive; user favorite rows are personal and removed by cascade.
- The `/v1` contract adds `DELETE /v1/me` with `{ currentPassword }`.
- Admin tooling imports the same planner/statements as the endpoint.

## Verification

- API: `npm run api:test && npx --workspace @nfcompra/api tsc --noEmit`.
- Web: `npm --workspace @nfcompra/web run test && npm --workspace @nfcompra/web run typecheck && npm --workspace @nfcompra/web run build`.
- Android: project validation command from `docs/AGENT_CONTEXT.md`.
- Local deletion tests include `PRAGMA foreign_key_check`.

## Out of scope

- No production deletion, deployment, GitHub push, or public admin HTTP endpoint.
- No broad cascade-rule migration.
