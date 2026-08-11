# AGENT_CONTEXT.md

## Project state

NFCompra MVP: shopping list app with Cloudflare Worker/D1 API, React PWA, and Android Compose app. All clients share the `/v1` contract. Production API: `https://api.nfcompra.esgarpe.dev`.
Local worktree layout is simplified to `C:\DAM2\NFCompra` on `main` and `C:\DAM2\NFCompra-dev` on `dev`. Old milestone worktrees are no longer registered in Git.

## Architecture

- **Monorepo**: npm workspaces (`apps/api`, `apps/web`). Android is separate (`apps/android`).
- **API**: Cloudflare Worker with D1 SQLite. Handles auth (register, login, password recovery with OTP), households, shopping lists, product catalog with autocomplete, favorites, authenticated product/category CRUD, notifications, and invitations.
- **Web**: React PWA. IndexedDB caches last successful list snapshot per user for offline read-only display. Optimistic mutations with retry on conflict. Mobile shell includes APK download and bottom navigation to Inicio, Hogares, Listas, and Catálogo; catalog/favorites share product card styling with shopping-list search, using compact two-column product cards on mobile. Catalog search is global when text is entered and uses a compact filter icon button plus popup radios for all products, favorites, or the selected category. Catalog management uses one `+` action with a Categoría/Producto segmented create dialog and expanded supermarket icon selectors; product cards infer icons from product names before category fallback so common foods avoid the generic cart. Category actions open by tapping an already selected category, while product cards keep a `...` action under the favorite button. Hogares mirrors the Android compact/expanded card flow: one active household is stored locally and Listas filters to that household when present.
- **Android**: Jetpack Compose. Room DB for offline-first product mutations queued via WorkManager. Tokens in Android Keystore. Defaults to production API in debug and release. Catalog UI mirrors the web compact filter icon button plus popup radio selector, and category/search views show compact product cards with favorite toggles plus a return-to-catalog action. The Favorites category loads from the catalog snapshot and filters by `isFavorite`, so newly favorited products appear there. List deletion is exposed from list cards, not inside the opened list detail. On authenticated load/household selection, list metrics are preloaded for every list in the selected household so list cards show pending/checked counts without opening each list.
- **Android session refresh**: access tokens last 1h and refresh tokens last 30 days. Auto sign-in refresh must only clear the persisted session on `401`; transient API/network failures keep the stored refresh token so the user is not forced to log in again.
- **Android biometric access**: optional local-only setting in Profile > Ajustes. It uses AndroidX Biometric with `BIOMETRIC_STRONG` and stores only the enabled account id in private SharedPreferences. Startup stays on the welcome screen: `Iniciar sesión` opens a saved session directly when one exists or shows the credential form otherwise; `Acceder con biometría` is enabled only for a saved session with biometric access enabled and shows the native biometric prompt. Explicit logout clears the local biometric association.
- **Android self-update**: on startup, Android checks GitHub Releases latest at `Speeson/NFCompra`; if the latest tag version is newer than `BuildConfig.VERSION_NAME` and includes `NFCompra-release.apk`, it shows an in-app update dialog. The APK downloads to app cache and opens Android's package installer through `FileProvider`; silent install/restart is not possible for a normal app.
- **NFC household links**: the primary sticker URL is `https://nfcompra.esgarpe.dev/household/<householdId>/lists`. Android also keeps `nfcompra://household/<householdId>/lists` for compatibility. Both open the authenticated app on the selected household's Lists tab; Android handles both normal `ACTION_VIEW` links and NFC `ACTION_NDEF_DISCOVERED` URL records. The PWA handles the HTTPS path as web fallback. If auth is required, Android keeps the destination through login/session restore. The household ID is authorized only by the normal authenticated household list; missing/unauthorized IDs fail closed with `No se pudo abrir este hogar.`.
- **Contract**: `/v1` versioned API. Product catalog supports search, snapshot download, favorites, categories, and authenticated create/update/delete for products and categories. Product deletion is a soft delete; category deletion detaches affected products and child categories.

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
- Maestro setup: CLI 2.8.0 in `~\.maestro\bin\maestro`; `MAESTRO_BIN` points to `maestro-launcher.exe` (a C# shim because Node `execFile` cannot run `.bat` on Windows). Requires an emulator/device connected via adb. AVDs available: Medium_Phone, Pixel_9_Pro_Fold, Small_Phone. APK installed manually with `adb install -r NFCompra-release.apk`.
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
- NFC App Link verification requires deploying `apps/web/public/.well-known/assetlinks.json` to `https://nfcompra.esgarpe.dev/.well-known/assetlinks.json`. The file contains both debug and release APK signing fingerprints.
- No WebSockets or push notifications.
- No remote deployment or CI/CD included.

## Docs

- `docs/api-contract.md`: versioned API contract
- `docs/architecture.md`: architecture details
- `docs/user-deletion-d1.md`: D1 user deletion procedure
