# Android biometric unlock

## Objective

Add optional local biometric unlock to the Android app without changing backend authentication. Biometrics unlock only an already persisted NFCompra session; the API remains authoritative through the existing access/refresh token flow.

## Approved design

- Add "Acceso con biometria" in Android Settings/Profile as a switch-style setting.
- Enabling checks AndroidX Biometric capability and enrolled biometrics, then shows the system `BiometricPrompt`.
- Store only an enabled account id for biometric unlock; no passwords, biometric data, or custom PINs.
- On cold startup, if a persisted session exists and biometric unlock is enabled for that same account, lock protected content until system biometric auth succeeds.
- If biometric auth is cancelled or fails, keep the session persisted but show the normal unauthenticated login flow.
- Explicit logout clears the backend session and disables the local biometric unlock association.
- NFC/deep-link destinations remain pending while biometric unlock is displayed; they are processed only after local unlock and normal session restoration.

## Architecture

- Tokens are stored in Android `KeystoreTokenStore` backed by encrypted SharedPreferences and Android Keystore.
- Session restoration starts in `AuthViewModel.tryAutoSignIn()` using `/v1/auth/refresh`; refresh tokens last 30 days and are only cleared on `401`.
- Logout calls `AuthRepository.logout()` and clears persisted tokens.
- Settings/Profile live in `ShoppingListScreen.kt` (`ProfilePanel` and `SettingsDialog`).
- Biometric preference will live in app private `SharedPreferences`, keyed to the authenticated account id derived from the existing access token.
- Use AndroidX Biometric (`BiometricManager`, `BiometricPrompt`) with `BIOMETRIC_STRONG` to avoid weak/custom auth and avoid storing any biometric material.
- No `/v1` API contract changes.

## Verification

- `.\gradlew.bat --no-daemon :feature:auth:testDebugUnitTest :app:assembleDebug`
- Manual device checks: enable biometric, cold start unlock, cancel fallback to login, explicit logout, NFC deep link after unlock.

## Out of scope

- Backend auth changes.
- Passwordless login.
- Custom PIN/password fallback.
- App-resume biometric locking after short background switches.
- Publishing/deploying or pushing to GitHub.
