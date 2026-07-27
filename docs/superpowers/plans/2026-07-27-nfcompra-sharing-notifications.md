# NFCompra Sharing and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir compartir hogares mediante invitaciones por correo y mostrar notificaciones internas de invitaciones y actividad remota de listas en API, PWA y Android.

**Architecture:** El Worker mantiene invitaciones y notificaciones en D1, aplica autorización por pertenencia y rol, y emite notificaciones al aceptar invitaciones o modificar una lista compartida. PWA y Android consumen el mismo contrato, muestran una campana con contador y panel, y ofrecen gestión de miembros e invitaciones; no introducen push ni almacenamiento offline en este hito.

**Tech Stack:** Cloudflare Workers/D1/Vitest, React/Vite/TanStack Query/React Testing Library, Kotlin/Compose/Retrofit/MockWebServer/JUnit.

## Global Constraints

- Trabajar únicamente en la rama aislada `hito3`; no hacer `git push`, PR ni despliegues sin autorización explícita.
- Tokens de invitación: aleatorios, de un solo uso, persistidos como hash y con caducidad de siete días.
- La aceptación exige una cuenta verificada cuyo email normalizado coincide exactamente con el de la invitación.
- Solo `owner` puede invitar, renovar/revocar invitaciones y eliminar miembros; nunca puede eliminarse a sí mismo.
- Las notificaciones son internas, persistentes y sin push; las mutaciones propias nunca generan una notificación para su autor.
- Agrupar actividad de lista por destinatario, autor, lista y tipo durante cinco minutos; no mezclar esos cuatro ejes.
- Mantener idempotencia de mutaciones y no registrar tokens, contraseñas ni claves.
- Tras cada tarea revisada, actualizar `README.md` solo con estado y comandos verificados.

---

### Task 1: Persistencia y API de miembros e invitaciones

**Files:**
- Create: `apps/api/migrations/0005_sharing.sql`
- Create: `apps/api/src/invitations/repository.ts`
- Create: `apps/api/src/invitations/routes.ts`
- Modify: `apps/api/src/email/email-sender.ts`
- Modify: `apps/api/src/email/resend-email-sender.ts`
- Modify: `apps/api/src/households/repository.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/shopping-lists.integration.test.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `AuthUser`, `Env`, `isHouseholdMember`, `EmailSender.send` and the existing authenticated Worker dispatch.
- Produces: `Invitation { id, householdId, email, status: 'pending' | 'accepted' | 'revoked' | 'expired', expiresAt, invitedBy, createdAt }`; owner-only routes `GET|POST /v1/households/:householdId/invitations`, `DELETE /v1/households/:householdId/invitations/:invitationId`, `GET /v1/households/:householdId/members`, `DELETE /v1/households/:householdId/members/:userId`, and `POST /v1/invitations/accept`.

- [ ] **Step 1: Write failing integration tests for the invitation lifecycle**

Add tests that create two verified users and a household, then assert all of the following: a member cannot invite; an owner creates an invitation for the second email; the captured email contains `APP_BASE_URL + '/invitations/accept?token='`; the raw token is absent from D1; accepting with the wrong verified account is rejected; accepting with the invited account creates exactly one `member` row; retrying acceptance reports a consumed invitation; a duplicate active invitation renews it and invalidates the old token; revoked and expired tokens are rejected; and an owner cannot remove themselves but can remove the second member.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --workspace @nfcompra/api run test -- --run test/shopping-lists.integration.test.ts`

Expected: FAIL because the invitation/member routes and D1 tables do not exist.

- [ ] **Step 3: Add the migration and repository contracts**

Create `0005_sharing.sql` with `invitations` and supporting indexes. Store `token_hash`, normalized `invited_email`, `status`, `expires_at`, `accepted_at`, `revoked_at`, `invited_by`, and timestamps. Enforce one active invitation per `(household_id, invited_email)` using an explicit replacement transaction/repository operation, not a fragile client-side check. Add repository functions with these signatures:

```ts
export async function createOrRenewInvitation(env: Env, input: { householdId: string; invitedBy: string; invitedEmail: string; rawToken: string; expiresAt: string }): Promise<Invitation>;
export async function acceptInvitation(env: Env, input: { rawToken: string; userId: string; userEmail: string }): Promise<{ invitation: Invitation; householdId: string }>;
export async function listHouseholdMembers(env: Env, householdId: string): Promise<HouseholdMember[]>;
export async function removeHouseholdMember(env: Env, input: { householdId: string; requesterId: string; memberUserId: string }): Promise<'removed' | 'forbidden' | 'self'>;
```

Use SHA-256 for the persisted token hash, generate the raw token with Web Crypto, and calculate `expiresAt` as seven days from creation. Extend the email abstraction with a typed invitation sender so test doubles can capture recipient, subject and URL without Resend credentials.

- [ ] **Step 4: Add owner/member routes and authorization**

Parse only bounded valid emails, normalize them with `trim().toLowerCase()`, and return `403` for a non-owner before exposing invitation/member data. Reject inviting an existing member with a domain error. `POST /v1/invitations/accept` obtains the authenticated user from the normal Worker middleware, verifies user email and `is_verified`, and maps invalid, expired, revoked, consumed and mismatched-email cases to distinct safe domain errors without household details. Route successful invitation mail through `EmailSender` and use `APP_BASE_URL` for the public acceptance URL.

- [ ] **Step 5: Make the migration test exercise a fresh D1 database**

Extend `migrations.integration.test.ts` to apply `0001` through `0005` from an empty database and assert the invitation table and active-invitation lookup indexes exist. Run the focused and full API suites.

Run: `npm run api:test && npx --workspace @nfcompra/api tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Update verified documentation and commit**

Update `README.md` with only the verified invitation routes/behaviour and the API verification command. Commit:

```bash
git add apps/api README.md
git commit -m "feat(api): add household invitations and members"
```

### Task 2: Persistencia y API de notificaciones internas

**Files:**
- Create: `apps/api/migrations/0006_notifications.sql`
- Create: `apps/api/src/notifications/repository.ts`
- Create: `apps/api/src/notifications/routes.ts`
- Modify: `apps/api/src/invitations/repository.ts`
- Modify: `apps/api/src/invitations/routes.ts`
- Modify: `apps/api/src/lists/repository.ts`
- Modify: `apps/api/src/lists/routes.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/shopping-lists.integration.test.ts`
- Modify: `apps/api/test/migrations.integration.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: task 1 invitation and membership repositories plus existing list mutation routes.
- Produces: `Notification { id, type, title, body, householdId, listId, invitationId, readAt, createdAt }`; `GET /v1/notifications`, `GET /v1/notifications/unread-count`, `PATCH /v1/notifications/:notificationId/read`, `POST /v1/notifications/read-all`.

- [ ] **Step 1: Write failing API tests for notification recipients and grouping**

Create a household with owner and member, then assert: creating an invitation adds one unread `invitation_received` notification only for the invitee once they are a verified account; accepting adds `invitation_accepted` only for the inviter; removing a member adds `member_removed` only for the removed user; an owner adding, editing, checking and deleting an item creates notifications for the other member but never the owner; two same-type updates by the same author to the same list within five minutes yield one grouped notification; changes in another list or by another author yield separate notifications; read-one and read-all change the unread count.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm --workspace @nfcompra/api run test -- --run test/shopping-lists.integration.test.ts`

Expected: FAIL because notification storage and routes do not exist.

- [ ] **Step 3: Add notification schema and repository**

Create `0006_notifications.sql` with a `notifications` table indexed by `(user_id, read_at, created_at)` and aggregation fields `actor_user_id`, `list_id`, `type`, and `grouped_until`. Implement:

```ts
export async function notifyUsers(env: Env, input: NotificationInput): Promise<void>;
export async function listNotifications(env: Env, userId: string, limit: number): Promise<Notification[]>;
export async function unreadNotificationCount(env: Env, userId: string): Promise<number>;
export async function markNotificationRead(env: Env, notificationId: string, userId: string): Promise<boolean>;
export async function markAllNotificationsRead(env: Env, userId: string): Promise<void>;
```

`notifyUsers` must exclude `actorUserId`, target current household members, and update an existing unread row only when recipient, actor, list and type match and `grouped_until >= now`; otherwise insert a new row. Invitation and removal notifications are never grouped with list activity.

- [ ] **Step 4: Emit notifications from successful state changes**

Call the repository only after a list mutation has completed successfully and before sending the final response. Include a minimal Spanish title/body and navigation IDs, never an invitation token or a hidden household name. Emit invitation and membership events from the task 1 atomic flows. Ensure replayed idempotent item operations do not emit a second notification.

- [ ] **Step 5: Add authenticated notification routes and migration coverage**

Make list/count/read routes accessible only to the current user, with bounded `limit` defaulting to 20 and maximum 50. A user marking another user’s notification must receive `404`. Extend the fresh migration test through `0006`.

- [ ] **Step 6: Run verification, document and commit**

Run: `npm run api:test && npx --workspace @nfcompra/api tsc --noEmit`

Update `README.md` with the verified internal-notification scope and commands. Commit:

```bash
git add apps/api README.md
git commit -m "feat(api): add internal notifications"
```

### Task 3: PWA de miembros, aceptación y campana

**Files:**
- Create: `apps/web/src/features/households/household-api.ts`
- Create: `apps/web/src/features/households/MembersPanel.tsx`
- Create: `apps/web/src/features/invitations/AcceptInvitationPage.tsx`
- Create: `apps/web/src/features/notifications/notification-api.ts`
- Create: `apps/web/src/features/notifications/NotificationBell.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/features/auth/AuthProvider.tsx`
- Modify: `apps/web/src/features/shopping-list/ShoppingListRoute.tsx`
- Modify: `apps/web/src/features/auth/auth.test.tsx`
- Modify: `apps/web/src/features/shopping-list/ShoppingListRoute.test.tsx`
- Create: `apps/web/src/features/households/MembersPanel.test.tsx`
- Create: `apps/web/src/features/invitations/AcceptInvitationPage.test.tsx`
- Create: `apps/web/src/features/notifications/NotificationBell.test.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: task 1/2 HTTP contracts through `apiClient`, current authenticated user and selected household/list state.
- Produces: owner member management, persistent invite acceptance routing and a notification bell with unread count and contextual navigation.

- [ ] **Step 1: Write failing component tests**

Add tests asserting an owner sees member list, invitation form, pending invitations, revoke and allowed remove controls; a non-owner sees read-only members; submitting an email invokes the invitation route and invalidates member/invitation queries. Add acceptance tests for direct `/invitations/accept?token=...` load, anonymous continuation through login, email mismatch error and successful navigation to the returned household. Add bell tests for unread badge, read-one, read-all, invitation navigation and a list notification navigation; assert polling runs only while the document is visible.

- [ ] **Step 2: Run the focused web tests to verify they fail**

Run: `npm --workspace @nfcompra/web run test -- --run src/features/households/MembersPanel.test.tsx src/features/invitations/AcceptInvitationPage.test.tsx src/features/notifications/NotificationBell.test.tsx`

Expected: FAIL because the views and API functions do not exist.

- [ ] **Step 3: Build typed query and mutation functions**

Define explicit TypeScript models matching the API. Use query keys `['households', householdId, 'members']`, `['households', householdId, 'invitations']`, `['notifications']`, and `['notifications', 'unread-count']`. Every mutation invalidates exactly its affected keys. Store an invitation continuation target only in `sessionStorage`, clear it after success or explicit cancellation, and never store raw invitation tokens in query cache or logs.

- [ ] **Step 4: Add routes and accessible UI**

Register the acceptance route without requiring an existing household. Add the bell to the authenticated shell with a labelled button, keyboard-operable panel, empty state, visible unread count and read-all action. Render member administration within the selected household; hide owner-only controls rather than relying on the UI for authorization. On a notification click mark it read, close the panel and navigate to its invitation, household or list context.

- [ ] **Step 5: Add visible refresh and error behaviour**

Use TanStack Query polling for notifications only when `document.visibilityState === 'visible'`; invalidate notifications after relevant local mutations. Preserve the existing list polling behaviour. Present API errors inline and maintain an actionable retry for failed invitation acceptance without disclosing unrelated household data.

- [ ] **Step 6: Run verification, document and commit**

Run: `npm run web:test && npm --workspace @nfcompra/web run typecheck && npm --workspace @nfcompra/web run build`

Update `README.md` with verified PWA routes and local test commands. Commit:

```bash
git add apps/web README.md
git commit -m "feat(web): add sharing and notification center"
```

### Task 4: Android de miembros, aceptación y campana

**Files:**
- Create: `apps/android/feature/sharing/src/main/java/dev/esgarpe/nfcompra/feature/sharing/SharingApi.kt`
- Create: `apps/android/feature/sharing/src/main/java/dev/esgarpe/nfcompra/feature/sharing/SharingRepository.kt`
- Create: `apps/android/feature/sharing/src/main/java/dev/esgarpe/nfcompra/feature/sharing/SharingViewModel.kt`
- Create: `apps/android/feature/sharing/src/main/java/dev/esgarpe/nfcompra/feature/sharing/SharingScreen.kt`
- Create: `apps/android/feature/sharing/src/test/java/dev/esgarpe/nfcompra/feature/sharing/SharingRepositoryTest.kt`
- Create: `apps/android/feature/sharing/src/test/java/dev/esgarpe/nfcompra/feature/sharing/SharingViewModelTest.kt`
- Create: `apps/android/feature/sharing/src/androidTest/java/dev/esgarpe/nfcompra/feature/sharing/SharingScreenTest.kt`
- Create: `apps/android/feature/sharing/build.gradle.kts`
- Modify: `apps/android/settings.gradle.kts`
- Modify: `apps/android/app/build.gradle.kts`
- Modify: `apps/android/app/src/main/java/dev/esgarpe/nfcompra/MainActivity.kt`
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreen.kt`
- Modify: `README.md`

**Interfaces:**
- Consumes: authenticated Retrofit client and all task 1/2 routes.
- Produces: `SharingUiState`, `SharingAction`, `NotificationUiModel`, a Compose members screen, notification bell and invitation deep-link destination.

- [ ] **Step 1: Write failing repository and ViewModel tests**

Use MockWebServer to prove the repository sends authenticated create/revoke/remove/accept/read requests and parses API errors. In ViewModel tests assert owner versus member actions, email validation, loading/error/retry, direct invitation-token acceptance and notification read/read-all. Verify notification refresh occurs on screen entry and foreground resume, and that a click emits a navigation event containing only permitted context IDs.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `cd apps/android; .\\gradlew.bat :feature:sharing:testDebugUnitTest`

Expected: FAIL because the sharing module and types do not exist.

- [ ] **Step 3: Add isolated Retrofit/repository and UI models**

Create `SharingApi` with DTOs matching the API and a `SharingRepository` mapping them to UI-neutral models. Define sealed interfaces:

```kotlin
sealed interface SharingUiState { data object Loading : SharingUiState; data class Ready(val members: List<MemberUiModel>, val invitations: List<InvitationUiModel>, val notifications: List<NotificationUiModel>, val unreadCount: Int, val isOwner: Boolean) : SharingUiState; data class Error(val message: String) : SharingUiState }
sealed interface SharingAction { data class Invite(val email: String) : SharingAction; data class Revoke(val invitationId: String) : SharingAction; data class RemoveMember(val userId: String) : SharingAction; data class AcceptInvitation(val token: String) : SharingAction; data class OpenNotification(val notificationId: String) : SharingAction; data object MarkAllRead : SharingAction; data object Retry : SharingAction }
```

Keep raw invitation tokens only in the in-memory navigation/deep-link handoff; do not write them to preferences or logs.

- [ ] **Step 4: Implement Compose screens and navigation**

Add a module dependency and a route that receives the selected household ID. Render a labelled bell with badge/panel and an accessible members screen. Owner controls must show confirmation before revoking/removing; non-owners see read-only content. Add a direct invitation acceptance route that preserves the token while authentication resolves, then clears it after success/cancellation. Notification clicks mark read before navigating to invitation, home or list context.

- [ ] **Step 5: Add UI coverage and foreground refresh**

Create Compose tests for bell unread/empty states, owner controls, member read-only state, error retry and accept-invitation screen. Wire a lifecycle-aware refresh in `MainActivity`/route resume that refreshes notifications while authenticated without a background worker or push service.

- [ ] **Step 6: Run verification, document and commit**

Run:

```powershell
cd apps/android
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

Update `README.md` with verified Android sharing/notification behaviour and commands. Commit:

```bash
git add apps/android README.md
git commit -m "feat(android): add sharing and notifications"
```

### Task 5: Integración, revisión y documentación del hito 3A

**Files:**
- Modify: `README.md`
- Create: `docs/api-contract.md`
- Modify: `docs/architecture.md`
- Create: `docs/superpowers/sdd/2026-07-27-nfcompra-sharing-notifications/progress.md`

**Interfaces:**
- Consumes: API and client implementations from tasks 1–4.
- Produces: contract and architecture documentation consistent with verified behaviour, plus a clean integration baseline.

- [ ] **Step 1: Write a failing contract-focused API test for the end-to-end shared flow**

Test an owner creating an invitation, the invited user accepting it, an item mutation by the owner, the member retrieving the item and notification, and the owner retrieving the acceptance notification. Assert no raw invitation token appears in any JSON response apart from the external email fixture.

- [ ] **Step 2: Run the test to verify any missing integration fails**

Run: `npm --workspace @nfcompra/api run test -- --run test/shopping-lists.integration.test.ts`

Expected: PASS only after tasks 1–2 are fully integrated; otherwise fix the integration before continuing.

- [ ] **Step 3: Document the actual versioned contract**

Populate `docs/api-contract.md` with request/response examples for invitation, member and notification routes; list authorization and error codes. Update `docs/architecture.md` with notification persistence, grouping and explicit exclusions (push/offline belong to later work). Do not document credentials or unverified deployment addresses.

- [ ] **Step 4: Run all project verification**

Run:

```powershell
npm run api:test
npx --workspace @nfcompra/api tsc --noEmit
npm run web:test
npm --workspace @nfcompra/web run typecheck
npm --workspace @nfcompra/web run build
cd apps/android
$env:ANDROID_HOME='C:\Users\esteb\AppData\Local\Android\Sdk'
.\gradlew.bat :feature:auth:testDebugUnitTest :feature:shoppinglist:testDebugUnitTest :feature:sharing:testDebugUnitTest :feature:sharing:compileDebugAndroidTestKotlin :app:assembleDebug
```

Expected: all commands exit with code 0.

- [ ] **Step 5: Check the diff, update README and commit**

Run: `git diff --check && git status --short`

Update `README.md` only with verified Hito 3A scope, commands and the explicit boundary that offline sync remains Hito 3B. Commit:

```bash
git add README.md docs
git commit -m "docs: finalize Hito 3A sharing guide"
```
