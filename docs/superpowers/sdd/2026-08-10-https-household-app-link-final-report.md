# HTTPS household App Link final report

## Built

- Android accepts both `https://nfcompra.esgarpe.dev/household/<householdId>/lists` and `nfcompra://household/<householdId>/lists`.
- Android "Codigo NFC" now copies the HTTPS URL for new NFC stickers.
- The web app routes `/household/<householdId>/lists` to the authenticated shopping-list household context.
- `apps/web/public/.well-known/assetlinks.json` is ready for deployment with the debug APK signing fingerprint.

## Validation

- `npm --workspace @nfcompra/web run test -- App.test.tsx` passed.
- `npm --workspace @nfcompra/web run typecheck` passed.
- `npm --workspace @nfcompra/web run build` passed.
- `.\gradlew.bat --no-daemon :feature:shoppinglist:compileDebugKotlin :app:assembleDebug` passed.
- `git diff --check` passed with existing line-ending warnings only.

## Remaining limitations

- Android HTTPS App Link auto-verification will only work after the web deployment serves `/.well-known/assetlinks.json`.
- Release APKs need the release signing certificate fingerprint added to `assetlinks.json`.
