# Hito 2 — final Important findings fix report

Date: 2026-07-27
Branch/worktree: `hito2` / `C:\DAM2\NFCompra\.worktrees\hito2`

## Scope and constraints

This pass fixes all six Important findings from the final Hito 2 review. It does not add invitations, sharing, NFC, offline persistence, background synchronization, deployment, CI, or any other deferred feature.

No remote operation was performed, no external credentials were used, and no real email was sent. API email tests inject an in-memory fake sender, including the provider-failure scenario. `README.md` was intentionally left unchanged for the subsequent documentation agent requested by the coordinator.

## Corrections

### 1. Android DELETE request body

- Replaced Retrofit `@DELETE` plus `@Body` with `@HTTP(method = "DELETE", hasBody = true)`.
- Added a MockWebServer regression test that checks the real request method, path, `expectedVersion`, and generated `operationId`.

RED evidence: the Android test compilation/execution failed before the fix because the required contract was unsupported.
GREEN evidence: the repository sends a DELETE request with the optimistic-concurrency JSON body and the shopping-list unit suite passes.

### 2. Android household/list setup UI

- Added a non-terminal `NoHouseholds` state.
- Added a first-household form that calls `POST /v1/households` and selects the returned default list.
- Added “Crear hogar” and “Crear lista” actions beside the authenticated selectors.
- Kept logout available in both the list state and the no-households setup state.
- Added MockWebServer/ViewModel tests for creating the first household and for creating/selecting an additional list.

RED evidence: tests failed to compile because `NoHouseholds` did not exist and the empty state could not handle `CreateHousehold`.
GREEN evidence: empty-household and additional-list flows reach `Data` with the returned IDs selected.

### 3. Observable Android authentication and logout

- `TokenStore` now exposes `StateFlow<SessionTokens?>`.
- Encrypted save, clear, and compare-and-clear operations update the observable state only after persistent storage succeeds.
- `MainActivity` renders auth or shopping UI from the observable session instead of a one-time Boolean snapshot.
- Added Android `/v1/auth/logout`; local tokens are cleared in `finally`, even when remote revocation fails.
- Refresh-authenticator failure clears the observable session, so exhausted refresh returns the app to authentication.
- Added tests for successful logout, failed remote logout, and refresh failure publishing an anonymous session.

### 4. Recoverable registration email failure

- Registration catches provider delivery failures and returns the normal JSON error envelope:

  ```json
  {
    "error": {
      "code": "EMAIL_DELIVERY_FAILED",
      "message": "No se pudo enviar el correo de verificación.",
      "details": {
        "retryPath": "/v1/auth/resend-verification"
      }
    }
  }
  ```

- Added `POST /v1/auth/resend-verification`. It issues and sends a fresh verification token for an existing unverified account and otherwise returns the same non-enumerating `202 accepted` result.
- Password-reset delivery failure also uses a JSON envelope and identifies `/v1/auth/forgot-password` as its retry path.
- Connected verification resend to the PWA registration recovery UI and the Android registration screen/repository.
- Added API, web, and Android regression tests; all use fakes or MockWebServer and never contact Resend.

RED evidence: the API integration test received the injected sender exception instead of a `Response`, the web test had no resend action, and Android had no resend repository method.
GREEN evidence: the failed registration remains recoverable, a resent token verifies the account, and both clients send the expected retry request.

### 5. Local PWA and Android API configuration

- Vite now proxies same-origin `/v1` requests to `http://localhost:8787`, so the default `ApiClient('/v1')` works with `npm run api:dev` plus `npm run web:dev`.
- `VITE_API_BASE_URL` remains available for direct overrides; its value must include the `/v1` prefix.
- Android debug defaults to `http://10.0.2.2:8787/`, the Android emulator address for the host API.
- Debug builds allow cleartext HTTP only through the debug manifest.
- Android debug can be overridden with either:

  ```powershell
  .\gradlew.bat :app:assembleDebug -PNFCompraApiBaseUrl=http://192.168.1.20:8787/
  ```

  or:

  ```powershell
  $env:NFCOMPRA_API_BASE_URL='http://192.168.1.20:8787/'
  .\gradlew.bat :app:assembleDebug
  ```

- Release still uses the non-routable placeholder and no endpoint or secret is packaged for production.
- The Gradle-property override was verified by generating `BuildConfig.AUTH_BASE_URL` with `http://127.0.0.1:9999/`.

### 6. Access-token session invalidation

- Access JWTs now contain the user’s integer `session_version`.
- Access verification returns both user ID and session version.
- Protected-request middleware loads the current user session and rejects a version mismatch.
- Password reset already increments `users.session_version` and revokes refresh tokens; it now also invalidates every previously issued access token.
- Added an integration assertion that an access token valid before password reset receives `401` afterward.

RED evidence: the old access token still returned `200` after reset.
GREEN evidence: the same request returns `401`.

### Migration-from-zero coverage

- Added a Cloudflare D1 integration test that reads the actual migration files and applies `0001` through `0004` to an empty isolated database.
- The test checks `users.session_version`, `refresh_tokens.session_version`, `sync_operations.lease_token`, and the recorded migration count.

## Verification commands

Executed from the repository root unless noted:

```powershell
npm --workspace @nfcompra/api run test
npx tsc --project apps/api/tsconfig.json
npm --workspace @nfcompra/web run test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
```

Executed from `apps/android`:

```powershell
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :app:assembleDebug
```

Final observed results before the local commit:

- API: 4 test files, 31 tests passed; TypeScript check passed.
- Web: 3 test files, 17 tests passed; typecheck and production build passed.
- Android: 17 JUnit tests passed with 0 failures/errors; debug APK assembled successfully.
- Migration coverage: all four real migrations applied successfully to an empty D1 database.
- `git diff --check`: no whitespace errors.

## Commit contract

One local commit contains the implementation, tests, configuration, and this report. No push, pull request, tag, release, deployment, or README update is part of this pass.
