# Task 5 — Android auth contract

- AuthRepository.login(email, password) emits AuthResult.SignedIn only after persisting a non-empty access/refresh token pair; failures emit AuthResult.Failure.
- Android authentication requests use /v1/auth/register, /verify-email, /login, /refresh, /forgot-password and /reset-password, with clientType: "android" for session endpoints.
- KeystoreTokenStore encrypts both persisted tokens with an AES-GCM key held by Android Keystore, commits both encrypted values before publishing them to the in-memory cache, and leaves the cache unchanged if persistence fails. Its save, clear and compareAndClear(expected) operations share one lock, so conditional cleanup cannot erase a concurrent newer save.
- BearerInterceptor adds the current access token. RefreshAuthenticator serializes concurrent 401 refreshes and compares the bearer captured in the failed request with the stored access token; a delayed stale 401 reuses the newer session without consuming refresh. Refresh/save failures use compareAndClear for the attempted pair, preserving a newer session. Retried requests are marked, and refresh endpoints or already-refreshed requests are never refreshed.
- Auth routes exposed by the Compose UI are login, registration, email verification, password recovery and password reset. The packaged default base URL is https://example.invalid/; no real API endpoint or secret is included.

Verified with:

    $env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'; .\gradlew.bat :feature:auth:testDebugUnitTest :app:assembleDebug
