# Product entry mode final report

## Delivered

- Added a per-user, cross-client `productEntryMode` preference to `/v1/me`, defaulting existing and new accounts to `catalog`.
- Added Catalog and Quick selectors to Web and Android Settings.
- Reused the existing list/card candidate, quantity, waitlist, and confirmation flows. Quick mode creates exactly one ephemeral UI candidate from trimmed visible input and performs no catalog search or mutation.
- Persisted catalog selections with their real `catalog_product_id`; quick selections are created only as `shopping_items` with `catalog_product_id = NULL`.
- Carried nullable catalog identity through the Android Room pending-operation payload so quick items retain the existing offline-first create/reconcile/sync behavior.
- Kept keyboard and voice recognition on the same text-to-candidate pipeline without automatic confirmation.

## Schema and contract

- Migration `0018_product_entry_mode.sql` adds `users.product_entry_mode TEXT NOT NULL DEFAULT 'catalog'` constrained to `catalog` or `quick`.
- `PATCH /v1/me` accepts `{ "productEntryMode": "catalog" | "quick" }` and `GET /v1/me` returns the preference.
- Shopping item creation accepts nullable `catalogProductId`; a non-null value must reference an active system product or a product belonging to the list's household.

## Verification

- API: migration harness and 94 tests passed; TypeScript typecheck passed.
- Web: 152 tests, TypeScript typecheck, and production PWA build passed.
- Android: database, network, auth, shopping-list, and sharing unit tests passed; shopping-list/sharing Android tests compiled; debug APK assembled.
- Release metadata validation passed. Deployment Impact requires Web, API, and Android release/build; the Android plan suggests `0.5.0` / version code `24` from all currently pending changesets.
- `git diff --check` passed with only Git's existing LF-to-CRLF working-copy notices.
