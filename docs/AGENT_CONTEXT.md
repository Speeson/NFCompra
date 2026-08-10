# AGENT_CONTEXT.md

## Project state

NFCompra MVP: shopping list app with Cloudflare Worker/D1 API, React PWA, and Android Compose app. All clients share the `/v1` contract. Production API: `https://api.nfcompra.esgarpe.dev`.
Local worktree layout is simplified to `C:\DAM2\NFCompra` on `main` and `C:\DAM2\NFCompra-dev` on `dev`. Old milestone worktrees are no longer registered in Git.

## Architecture

- **Monorepo**: npm workspaces (`apps/api`, `apps/web`). Android is separate (`apps/android`).
- **API**: Cloudflare Worker with D1 SQLite. Handles auth (register, login, password recovery with OTP), households, shopping lists, product catalog with autocomplete, favorites, notifications, and invitations.
- **Web**: React PWA. IndexedDB caches last successful list snapshot per user for offline read-only display. Optimistic mutations with retry on conflict.
- **Android**: Jetpack Compose. Room DB for offline-first product mutations queued via WorkManager. Tokens in Android Keystore. Defaults to production API in debug and release.
- **NFC household links**: the primary sticker URL is `https://nfcompra.esgarpe.dev/household/<householdId>/lists`. Android also keeps `nfcompra://household/<householdId>/lists` for compatibility. Both open the authenticated app on the selected household's Lists tab; the PWA handles the HTTPS path as web fallback. If auth is required, Android keeps the destination through login/session restore. The household ID is authorized only by the normal authenticated household list; missing/unauthorized IDs fail closed with `No se pudo abrir este hogar.`.
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

## Agent setup

- Global MCPs (`~/.config/opencode/opencode.jsonc`): playwright, context7.
- Project MCPs (`opencode.json`): cloudflare (`@cloudflare/mcp-server-cloudflare run <accountId>`, uses `CLOUDFLARE_API_TOKEN` env var; verified working — lists D1/Workers), maestro (drives Android E2E via Maestro CLI).
- Maestro setup: CLI 2.8.0 in `~\.maestro\bin\maestro`; `MAESTRO_BIN` points to `maestro-launcher.exe` (a C# shim because Node `execFile` cannot run `.bat` on Windows). Requires an emulator/device connected via adb. AVDs available: Medium_Phone, Pixel_9_Pro_Fold, Small_Phone. Debug APK installed manually with `adb install -r NFCompra-debug.apk`.
- Project skills (`.opencode/skills/`): nfcompra-api-contract, nfcompra-android-compose, nfcompra-offline-sync.
- Global skills: spec-driven-development, verify-before-done, systematic-debugging, code-review.

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

# Android NFC deep link smoke test
adb shell am start -a android.intent.action.VIEW -d "nfcompra://household/<householdId>/lists"
adb shell am start -a android.intent.action.VIEW -d "https://nfcompra.esgarpe.dev/household/<householdId>/lists"
```

## Known limitations

- PWA does not queue offline mutations. Android offline queue limited to product mutations only.
- NFC App Link verification requires deploying `apps/web/public/.well-known/assetlinks.json` to `https://nfcompra.esgarpe.dev/.well-known/assetlinks.json`. The current file contains the debug APK signing fingerprint; release APKs need their release certificate fingerprint added.
- No WebSockets or push notifications.
- No remote deployment or CI/CD included.

## Docs

- `docs/api-contract.md`: versioned API contract
- `docs/architecture.md`: architecture details
- `docs/user-deletion-d1.md`: D1 user deletion procedure
