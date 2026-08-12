# AGENT_CONTEXT.md

## Project state

NFCompra MVP: shopping list app with Cloudflare Worker/D1 API, React PWA, and Android Compose app. All clients share the `/v1` contract. Production API: `https://api.nfcompra.esgarpe.dev`.
Local worktree layout is simplified to `C:\DAM2\NFCompra` on `main` and `C:\DAM2\NFCompra-dev` on `dev`. Old milestone worktrees are no longer registered in Git.

## Architecture

- **Monorepo**: npm workspaces (`apps/api`, `apps/web`). Android is separate (`apps/android`).
- **API**: Cloudflare Worker with D1 SQLite. Handles auth (register, login, password recovery with OTP), authenticated profile editing/password change, households, shopping lists, product catalog with autocomplete, favorites, authenticated product/category CRUD, notifications, and invitations.
- **Web**: React PWA. IndexedDB caches last successful list snapshot per user for offline read-only display. Optimistic mutations with retry on conflict. Mobile shell includes APK download and bottom navigation to Inicio, Hogares, Listas, and Catálogo; the desktop shell no longer exposes the removed standalone `/nfc` page. Catalog/favorites share product card styling with shopping-list search, using compact two-column product cards on mobile. Shopping-list product search requires 3 characters and returns 12 list results or 8 card results. Catalog search is global when text is entered and uses a compact filter icon button plus popup radios for all products, favorites, or the selected category. Catalog management uses one `+` action with a Categoría/Producto segmented create dialog and expanded supermarket icon selectors; product cards infer icons from product names before category fallback so common foods avoid the generic cart. Category actions open by tapping an already selected category, while product cards keep a `...` action under the favorite button. Hogares mirrors the Android compact/expanded card flow: one active household is stored locally and Listas filters to that household when present; legacy `/households/<id>` and NFC HTTPS `/household/<id>/lists` web routes open that household's list-card overview. The `/profile` route edits first name, last name and username, keeps email read-only, and changes password through `/v1/me/change-password`.
- **Android**: Jetpack Compose. Room DB for offline-first product mutations queued via WorkManager. Tokens in Android Keystore. Defaults to production API in debug and release. Catalog UI mirrors the web compact filter icon button plus popup radio selector, with a contextual `+` action on the root catalog and a `...` category action inside a selected category. Category/search views keep the search header fixed, scroll only product cards, and product cards include favorite plus `...` edit/delete actions. Android catalog management calls authenticated product/category create/update/delete endpoints and clears the catalog snapshot cache after mutations. The Favorites category loads from the catalog snapshot and filters by `isFavorite`, so newly favorited products appear there. List deletion is exposed from list cards, not inside the opened list detail. On authenticated load/household selection, list metrics are preloaded for every list in the selected household so list cards show pending/checked counts without opening each list. The Profile tab is a dedicated editable screen; it refreshes `/v1/me` when opened, leaves Settings as its own dialog, and supports authenticated password change.
- **Android session refresh**: access tokens last 1h and refresh tokens last 30 days. Backend token expiry is independent from the Android local unlock timeout. Auto sign-in refresh must only clear the persisted session on `401`; transient API/network failures keep the stored refresh token so the user is not forced to log in again. Expired access tokens can refresh transparently through the existing refresh-token flow; invalid/revoked refresh sessions require normal login.
- **Android biometric/local unlock**: optional account-specific biometric access in Profile > Ajustes uses AndroidX Biometric with `BIOMETRIC_STRONG` and stores only the enabled account id in private SharedPreferences. Android also stores an account-specific `lastLocalAuthenticationAt` timestamp in private SharedPreferences. Credential login or biometric success starts a 1h local unlock window; reopening within that window enters directly, while reopening after it requires biometric when enabled or normal login fallback when disabled. Explicit logout clears the backend session, local unlock timestamp, and matching biometric association. NFC household deep links are held until the saved session passes the local unlock gate.
- **Android self-update**: on startup, Android checks GitHub Releases latest at `Speeson/NFCompra`; if the latest tag version is newer than `BuildConfig.VERSION_NAME` and includes `NFCompra-release.apk`, it shows an in-app update dialog. The dialog shows APK size plus live download progress, percent, downloaded MB, total MB and speed. The APK downloads to app cache and opens Android's package installer through `FileProvider`; silent install/restart is not possible for a normal app. Before opening the installer, Android stores the release notes locally; after the app is reopened on that installed version, it shows a one-time changelog dialog. Current Android release version is `0.1.7` (`versionCode` 8) after Android local unlock timeout/biometric session changes.
- **NFC household links**: the primary sticker URL is `https://nfcompra.esgarpe.dev/household/<householdId>/lists`. Android also keeps `nfcompra://household/<householdId>/lists` for compatibility. Both open the authenticated app on the selected household's Lists tab; Android handles both normal `ACTION_VIEW` links and NFC `ACTION_NDEF_DISCOVERED` URL records. The PWA handles the HTTPS path as web fallback. If auth is required, Android keeps the destination through login/session restore. The household ID is authorized only by the normal authenticated household list; missing/unauthorized IDs fail closed with `No se pudo abrir este hogar.`.
- **Catalog search performance**: `product_aliases` is indexed by `product_id` (migration `0010_product_alias_product_index.sql`, applied to production 2026-08-12) so the correlated alias lookup in `/v1/product-catalog?search=` switches from a full alias scan per product (~12.6M rows/query) to an index seek (~7k rows). Android warms the catalog snapshot when the Catálogo tab opens (`warmProductCatalog()` on `ShoppingListViewModel`, triggered from `LaunchedEffect(selectedTab, ...)` in `ShoppingListContent`, idempotent via in-memory + file cache). Normal typing searches the local snapshot; the remote search endpoint is fallback only. Minimum catalog search length is 3 characters with a 350 ms debounce and generation-based stale-search cancellation in `CatalogPanel`.
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
- D1/Android: migration 0010 indexes product_aliases(product_id) (applied to production) and Android warms/searches the catalog snapshot locally (remote search is fallback, 3-char min, 350 ms debounce). Release APK rebuilt with the standard `~/.android/nfcompra-release.jks` signing (cert CN=NFCompra, SHA-256 ec42b67d…).

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
- PWA production deploy is handled by Vercel and redeploys automatically after pushing to GitHub `main`. API deploys are separate and use Wrangler/Cloudflare OAuth login; do not rely on `CLOUDFLARE_API_TOKEN` for deploys.

## Docs

- `docs/api-contract.md`: versioned API contract
- `docs/architecture.md`: architecture details
- `docs/user-deletion-d1.md`: D1 user deletion procedure
