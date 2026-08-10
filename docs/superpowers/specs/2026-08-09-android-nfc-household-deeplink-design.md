# Android NFC household deep link

## Objective

Add generic NFC deep-link support so an NFC sticker can contain a household URI and open NFCompra on that household's Lists screen. The household is identified only by persistent ID, never by name or by hardcoded Costa Marina 3 behavior.

## Approved Design

NFCompra accepts:

```text
nfcompra://household/<householdId>/lists
```

Scanning the URI launches the Android app. If a valid session is already restored, the app opens the same household/list state used by `Hogares -> Acceder` and shows the Lists tab. If login is required, the app keeps the pending destination through the normal auth flow and opens it after login succeeds.

## Architecture

- `apps/android/app`: add the manifest intent filter and parse VIEW intents in `MainActivity`, including both initial intent and `onNewIntent`.
- `apps/android/feature/shoppinglist`: reuse `ShoppingListViewModel.openContext(householdId)` and add a Lists-tab target to the Compose shell.
- The `/v1` contract does not change. Authorization remains server-backed: the app must confirm the requested household appears in the authenticated user's household data before opening it.

## Acceptance Criteria

- Authenticated app open: scanning opens the requested household on Lists.
- App in background: the new intent resumes the app and opens the requested household on Lists.
- App process closed: the app launches, restores the session, and opens the requested household on Lists.
- Authentication required: login is shown normally, then the pending household opens after login.
- Invalid URI or household ID: the app does not crash and shows a safe Spanish error/fallback.
- Unauthorized household: the ID is not treated as proof of access; no household data is revealed.
- Deleted household: the app fails closed without selecting another household as a substitute.

## Verification

From `apps/android`:

```sh
.\gradlew.bat --no-daemon :feature:shoppinglist:testDebugUnitTest :app:assembleDebug
adb shell am start -a android.intent.action.VIEW -d "nfcompra://household/<REAL_ID>/lists"
```

Use device/Maestro validation when available to confirm the visible Lists screen and selected household.

## Out Of Scope

- NFC writing implementation.
- Deep links for lists, products, invitations, or web app routes.
- Any backend, D1 schema, or `/v1` response changes.
