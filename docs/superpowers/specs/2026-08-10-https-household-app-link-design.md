# HTTPS household App Link

## Objective

Use a single NFC URL that works as an Android App Link when NFCompra is installed and as a normal web URL when it is not. Keep the existing `nfcompra://` household link working for already-written tags and manual tests.

## Approved design

- Android accepts `https://nfcompra.esgarpe.dev/household/<householdId>/lists` and routes it to the authenticated household lists view.
- Android still accepts `nfcompra://household/<householdId>/lists`.
- The Android "Codigo NFC" dialog copies the HTTPS URL as the primary value for new NFC stickers.
- The web app accepts `/household/<householdId>/lists` and opens the same authenticated shopping-list route currently reached with `/?household=<householdId>`.
- The web app serves `.well-known/assetlinks.json` for Android domain verification after the web app is deployed.

## Architecture

- No `/v1` API contract changes.
- Android changes stay in `apps/android/app` for intent filters and parsing, plus `apps/android/feature/shoppinglist` for the copied NFC URL.
- Web changes stay in `apps/web` for SPA routing and the static asset-links file.

## Verification

- `npm --workspace @nfcompra/web run typecheck`
- `npm --workspace @nfcompra/web run build`
- `.\gradlew.bat --no-daemon :feature:shoppinglist:compileDebugKotlin :app:assembleDebug`

## Out of scope

- Deploying the web app or updating DNS/hosting.
- Re-signing production release APKs.
- Rewriting existing NFC stickers automatically.
