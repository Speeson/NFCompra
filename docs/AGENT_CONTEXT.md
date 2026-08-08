# AGENT_CONTEXT.md

## Project state

NFCompra MVP: shopping list app with Cloudflare Worker/D1 API, React PWA, and Android Compose app. All clients share the `/v1` contract. Production API: `https://api.nfcompra.esgarpe.dev`.

## Architecture

- **Monorepo**: npm workspaces (`apps/api`, `apps/web`). Android is separate (`apps/android`).
- **API**: Cloudflare Worker with D1 SQLite. Handles auth (register, login, password recovery with OTP), households, shopping lists, product catalog with autocomplete, favorites, notifications, and invitations.
- **Web**: React PWA. IndexedDB caches last successful list snapshot per user for offline read-only display. Optimistic mutations with retry on conflict.
- **Android**: Jetpack Compose. Room DB for offline-first product mutations queued via WorkManager. Tokens in Android Keystore. Defaults to production API in debug and release.
- **Contract**: `/v1` versioned API. Product catalog supports search, snapshot download, favorites, and categories.

## Recent work (last 20 commits)

- Android: LoginScreen back button styling, auth form improvements, catalog favorites, loading states, household/list management features.
- Web: Landing page expanded with app previews and refreshed content.
- Android: Dashboard shell polishing, compact household cards, lists grouped by household, gradient shell styling.
- Android: BackHandler in auth flow for proper system Back navigation; email validation on password recovery; resend-code action on OTP screen; responsive WelcomeScreen and dashboard shell.
- Android: Double-back-to-exit via BackHandler + Toast on both auth welcome and dashboard home root screens.
- Android: HouseholdCard shows owner/member status. Owner: delete+edit. Member: leave (calls DELETE /v1/households/{id}/leave) + disabled edit.
- Android: NotificationPopup with compact/expandable items (title+date+time+X collapsed; body+actions expanded). Single-notification delete via X button calls DELETE /v1/notifications/{id}.
- API: DELETE /v1/households/{id}/leave for self-removal. DELETE /v1/notifications/{id} for single notification delete. Access tokens at 1h.

## Build / test commands

```sh
# API
npm run api:test && npx --workspace @nfcompra/api tsc --noEmit

# Web
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build

# Android (from apps/android, requires ANDROID_HOME)
.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

## Known limitations

- PWA does not queue offline mutations. Android offline queue limited to product mutations only.
- No NFC, WebSockets, or push notifications.
- No remote deployment or CI/CD included.

## Docs

- `docs/api-contract.md`: versioned API contract
- `docs/architecture.md`: architecture details
- `docs/user-deletion-d1.md`: D1 user deletion procedure
