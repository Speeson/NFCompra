# NFCompra Profile Screen Design

## Objective

Create a dedicated authenticated Profile experience across API, Web, and Android for account identity and security. The profile supports editing first name, last name, username, and changing password while leaving email read-only.

## Approved Design

- Header: centered avatar/initials placeholder and read-only email.
- Datos personales: rows for Nombre, Apellidos, Username. Each row opens a small edit dialog.
- Seguridad: one row for Cambiar contrasena. It opens a password dialog with current password, new password, and confirmation.
- Android replaces the old Profile popup with a dedicated Profile tab screen. Existing Settings, including biometrics, stays separate.

## Architecture

- API: extend authenticated `/v1/me` PATCH for partial `firstName`, `lastName`, `username` updates and add `POST /v1/me/change-password`.
- Username uniqueness remains enforced by the existing `users.username UNIQUE COLLATE NOCASE` index and explicit conflict checks.
- Password change verifies the current password, validates the new password using the existing minimum policy, hashes with the existing password hasher, and keeps the current session valid.
- Web and Android update current profile state immediately after successful mutations.

## Verification

- API: `npm run api:test && npx --workspace @nfcompra/api tsc --noEmit`
- Web: `npm --workspace @nfcompra/web run test`, `npm --workspace @nfcompra/web run typecheck`, `npm --workspace @nfcompra/web run build`
- Android: affected module compiles and app build from `apps/android`.

## Out of Scope

- Avatar upload.
- Email change.
- Account deletion.
- Notification, appearance, accessibility, biometric, session, or device settings.
