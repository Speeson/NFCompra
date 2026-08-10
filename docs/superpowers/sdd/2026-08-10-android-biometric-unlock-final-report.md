# Android biometric unlock final report

## Implemented

- Added AndroidX Biometric to the Android app and declared `USE_BIOMETRIC`.
- Added optional local biometric unlock storage keyed to the authenticated account id.
- Added a Profile > Ajustes switch for "Acceso con biometria".
- Enabling biometric access requires a successful system biometric prompt.
- Cold startup with a persisted session and enabled biometric access locks protected content until biometric success.
- Cancel/failure keeps the persisted session and allows normal login fallback.
- Explicit logout clears tokens and the local biometric account association.
- NFC/deep-link household destinations remain pending while the biometric lock screen is active and are processed after unlock.

## Security

- No backend auth change.
- No password, biometric data, or custom PIN storage.
- Uses AndroidX `BiometricPrompt` with `BIOMETRIC_STRONG`.
- Stores only the enabled account id in app-private `SharedPreferences`.

## Validation

- `.\gradlew.bat --no-daemon :app:testDebugUnitTest --tests dev.esgarpe.nfcompra.BiometricUnlockSettingsTest :feature:shoppinglist:compileDebugKotlin :app:compileDebugKotlin`
- `.\gradlew.bat --no-daemon :app:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :app:assembleDebug`
