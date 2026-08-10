# Android NFC Household Deep Link Plan

**Goal:** Implement generic Android deep links for `nfcompra://household/<householdId>/lists`.

## Tasks

- [x] Add Android manifest support for the NFC household URI.
- [x] Parse initial and new VIEW intents in `MainActivity`, preserving pending destinations across auth.
- [x] Reuse `ShoppingListViewModel.openContext(householdId)` and request the Lists tab after a successful deep-link open.
- [x] Make requested household context fail closed when the authenticated household list does not contain the ID.
- [x] Add focused ViewModel coverage for unauthorized/missing requested household IDs.
- [x] Identify the Costa Marina 3 household ID safely.
- [x] Validate with Gradle and adb/device checks.
- [x] Update `docs/AGENT_CONTEXT.md` with persistent deep-link behavior.
