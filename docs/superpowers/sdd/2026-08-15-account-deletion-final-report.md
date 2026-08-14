# Account deletion final report

Built shared backend account deletion with self-service API, local admin dry-run/confirm command, Web settings UI, and Android settings UI.

Validation completed:

- `npm run api:test`
- `npx --workspace @nfcompra/api tsc --noEmit`
- `npm --workspace @nfcompra/web run test`
- `npm --workspace @nfcompra/web run typecheck`
- `npm --workspace @nfcompra/web run build`
- `.\gradlew.bat :core:database:testDebugUnitTest :core:network:testDebugUnitTest :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug`
- `npm run admin:delete-user -- admin-dry-run@example.test --dry-run`

Release requirement: apply migration `0014_account_deletion_author_nullable.sql`, then redeploy the Worker API. Android needs a new APK/AAB to expose the native settings action.
