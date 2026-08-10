# Android biometric unlock plan

1. Add AndroidX Biometric dependency.
2. Add local biometric settings storage keyed to the authenticated account id.
3. Add a biometric prompt coordinator in `MainActivity`.
4. Gate authenticated content on cold startup when biometric unlock is enabled.
5. Add the Settings/Profile biometric switch and enable/disable callbacks.
6. Ensure logout clears biometric unlock association and pending deep links remain queued until unlock.
7. Add focused unit tests for preference/account behavior where practical.
8. Compile Android and refresh `NFCompra-debug.apk`.
9. Update `docs/AGENT_CONTEXT.md` and write final SDD report.
