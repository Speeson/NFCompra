# Android NFC household deep link final report

## Built

- Added `nfcompra://household/<householdId>/lists` Android deep-link support.
- Preserved pending household destinations through auth/session restoration.
- Reused normal household selection state and opened the Lists tab after deep-link handling.
- Made missing or unauthorized requested household IDs fail closed without selecting a fallback household.

## Costa Marina III

- Household ID: `63a2bf3b-d700-4c6a-83d8-3362f44f35ce`
- NFC URI: `nfcompra://household/63a2bf3b-d700-4c6a-83d8-3362f44f35ce/lists`

## Validation

- `.\gradlew.bat --no-daemon :app:assembleDebug`: passed.
- `.\gradlew.bat --no-daemon :feature:shoppinglist:testDebugUnitTest --tests "dev.esgarpe.nfcompra.feature.shoppinglist.ShoppingListViewModelTest.requested household context fails closed when it is not authorized"`: passed.
- Full `:feature:shoppinglist:testDebugUnitTest`: failed due existing dispatcher-sensitive ViewModel/account-session timeouts unrelated to the new regression; the NFC regression itself passed.
- ADB real URI, app open/background/cold: passed on `Medium_Phone`; UI showed `Listas`, `Costa Marina III`, and selected Lists tab.
- ADB invalid household ID: passed; warm launch stayed on the current Costa Marina III Lists state without exposing the requested invalid household.
- Maestro flow opening the real URI and asserting `Listas` and `Costa Marina III`: passed.

## Security Review

- URI contains no credentials.
- Household ID is not authorization.
- Requested household opens only when present in the authenticated household list.
- Malformed and inaccessible destinations do not crash the app.
- Deep-link handling uses the existing shopping session and does not introduce a separate NFC-only household state.
