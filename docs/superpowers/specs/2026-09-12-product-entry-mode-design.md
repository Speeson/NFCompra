# Product entry mode design

## Objective

Allow each user to choose between catalog autocomplete and quick free-text entry while keeping the existing quantity, pending tray, confirmation, voice, list, grid, and Android offline flows.

## Approved design

- `catalog` remains the default and preserves the current search experience.
- `quick` turns trimmed typed or dictated text into one temporary candidate and never creates a catalog record.
- Confirmed quick entries are normal shopping items with `catalog_product_id = NULL`.
- Catalog candidates carry their real catalog id through shopping-item creation.
- The account setting is available in Web and Android and applies without signing out.

## Architecture

- D1 stores `users.product_entry_mode` with a constrained `catalog` default.
- `GET/PATCH /v1/me` exposes and updates `productEntryMode`.
- Shopping-item creation accepts nullable `catalogProductId`; no catalog mutation is involved.
- Web and Android use a UI candidate identity separate from the nullable catalog id.
- Android includes the nullable id in its existing Room-backed create-operation payload; queue ordering, retries, reconciliation, and Room item projection remain unchanged.

## Verification

- API: `npm run api:test` and `npx tsc -p apps/api/tsconfig.json --noEmit`.
- Web: test, typecheck, and build workspace scripts.
- Android: database/network/auth/shopping-list/sharing unit tests, Android-test compilation, and debug assembly.
- Repository: `git diff --check`, changeset validation, and deployment impact.

## Out of scope

- New catalog types, aliases, fuzzy matching, automatic voice confirmation, or catalog creation from quick entry.
- Redesigning shopping-list screens or changing local view/theme preferences.
