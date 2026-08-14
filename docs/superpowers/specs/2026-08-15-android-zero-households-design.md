# Android zero-households authenticated design

## Objective

Treat zero households as a valid authenticated Android state. Users must remain inside the normal app shell so they can create a household, inspect invitation notifications, open Profile/Settings, or wait for access.

## Approved Design

- Home shows a polished empty state when `households` is empty.
- If invitation notifications exist, Home prioritizes them as invitation cards with existing accept/delete actions.
- If no invitation notifications exist, Home shows neutral copy with `Crear hogar` and `Ver invitaciones`.
- Bottom navigation remains visible. Lists does not open stale data when no household exists; it shows a clear message instead.
- Households and Profile remain available.

## Architecture

- Android only.
- `ShoppingListViewModel` publishes a normal `Data` state with empty households instead of blocking on `NoHouseholds`.
- `ShoppingListContent` accepts lightweight invitation notice models supplied by `MainActivity` from the existing global notification `SharingViewModel`.
- Invitation accept/reject callbacks reuse the existing `SharingAction.AcceptInvitationById` and `SharingAction.DeleteNotification` paths.
- Accepting an invitation continues to use existing global sharing navigation to call `ShoppingListViewModel.openContext(householdId)`.
- No `/v1` contract changes.

## Verification

- `.\gradlew.bat :feature:shoppinglist:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:testDebugUnitTest :app:assembleDebug`

## Out of Scope

- New backend reject-invitation endpoint.
- Web zero-household UX.
- Push notifications or realtime invitation updates.
