---
name: nfcompra-android-compose
description: "Use ONLY when editing the NFCompra Android app: Compose UI, Room database, auth screens, navigation, or Gradle builds. Covers module layout, Compose conventions, offline-first Room data, Keystore tokens, and the exact validation commands."
---

# NFCompra Android (Compose)

Rules for the Android app in `apps/android`.

## When to load
- Any change under `apps/android`: screens, navigation, Room, network, auth, Gradle config.

## Module layout
- `:app` — Application, navigation shell, dashboard.
- `:core:designsystem` — shared Compose theme, colors, components.
- `:core:network` — Retrofit2 + Moshi + OkHttp client, Bearer auth.
- `:core:database` — Room DB, schemas, isolated per account.
- `:feature:auth` — welcome/login/signup/recovery/OTP screens, Keystore token store.
- `:feature:shoppinglist` — lists, products, catalog, favorites, offline sync.
- `:feature:sharing` — households, members, invitations, notifications.

## Conventions
- Use existing Compose components, theme values, colors, dimensions. Do not introduce new palettes.
- Adaptive layouts, not dimensions tied to one device/resolution.
- All strings in Spanish (app UI is es-ES).
- Keep existing navigation, architecture, and visual style unless the task requires changing them.

## Architecture facts
- Tokens live in Android Keystore, never in the Room DB or prefs.
- Debug builds default to production API `https://api.nfcompra.esgarpe.dev/`; override for emulator via Gradle property `NFCompraApiBaseUrl=http://10.0.2.2:8787/` or env `NFCOMPRA_API_BASE_URL`.
- Product mutations queue offline in Room + WorkManager; list/household mutations use direct HTTP. See the `nfcompra-offline-sync` skill.
- Session/refresh coordination is shared per process; a late cached read must not overwrite a newer session or the currently open household/list.

## Validation (from apps/android, requires ANDROID_HOME)
```
.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```
- Run the narrowest module task first if you only changed one module.
- Unit tests use JUnit4 + Robolectric + MockWebServer; Compose androidTests are compiled but not run on device here.
