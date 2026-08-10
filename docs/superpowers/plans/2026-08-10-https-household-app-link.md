# HTTPS household App Link plan

1. Add Android HTTPS intent filter for `nfcompra.esgarpe.dev/household/*/lists`.
2. Extend Android deep-link parsing to accept both HTTPS and `nfcompra://` household links.
3. Update the Android NFC dialog to copy the HTTPS URL.
4. Add web route handling for `/household/<householdId>/lists`.
5. Add Android App Links `assetlinks.json` under the web public folder.
6. Build and typecheck the changed apps, then refresh `NFCompra-debug.apk`.
