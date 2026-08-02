# NFCompra authenticated dashboard implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal authenticated header with a responsive household-centred dashboard and full application navigation.

**Architecture:** Add a route-aware application shell, then compose dashboard, households and list views using the existing React Query API functions. `ShoppingListRoute` remains responsible for list mutations and offline snapshots.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vite, Vitest and Testing Library.

## Global Constraints

- Do not alter API, D1, auth payloads or registration fields.
- Preserve all auth, invitation and notification deep-link routes.
- Copy `C:\DAM2\NFCompra\apps\web\src\assets\brand\nfcompra-logo.png` into the worktree; do not modify the user's source file.
- NFC copy may say stickers work; without an NFC management API, never pretend a write succeeded.
- Download APK remains disabled until a real URL exists.
- Profile and Settings are presentational; Sign out uses the existing action.
- Keep controls touch/keyboard accessible; no deployment or remote operation.
- Update README only after verified task completion.

---

### Task 1: Landing controls and logo

**Files:** create `apps/web/src/assets/brand/nfcompra-logo.png`; modify `PublicLanding.tsx`, `PublicLanding.test.tsx`, `global.css`, `README.md`.

- [ ] Write a failing test for distinct `Iniciar sesión` and `Registrarse` buttons, asserting callbacks `'login'` and `'register'`, plus NFC text that says a sticker opens its linked household.
- [ ] Run `npm --workspace @nfcompra/web run test -- PublicLanding.test.tsx`; expect RED because the former landing has future NFC wording.
- [ ] Copy the supplied logo asset and render it in the landing. Implement both buttons with `onOpenAuth('login')` and `onOpenAuth('register')`; replace future NFC copy and make controls responsive.
- [ ] Run focused and full web tests, typecheck, build and `git diff --check`; update README only if green.
- [ ] Commit locally: `feat(web): refine landing access and NFC`.

### Task 2: Authenticated shell

**Files:** create `features/app-shell/AppShell.tsx` and test; modify `App.tsx`, `global.css`, `README.md`.

- [ ] Write failing tests for logo/name, desktop links Inicio/Hogares/Mis listas/NFC, disabled Download APK, notification bell, profile menu actions and Escape/focus return; assert mobile nav has Inicio/Hogares/Listas/NFC.
- [ ] Run the focused test; expect RED because `AppShell` does not exist.
- [ ] Implement `AppShell({ user, pathname, onNavigate, onLogout, children })`: fixed desktop header, mobile bottom navigation, `NotificationBell`, labelled profile menu with Profile/Settings/Sign out, outside/Escape close and focus return.
- [ ] Wrap authenticated normal routes only; leave all anonymous and special auth/invitation routes before the shell.
- [ ] Verify focused/full tests, typecheck, build, diff check; update README and commit `feat(web): add authenticated application shell`.

### Task 3: Household dashboard

**Files:** create `features/dashboard/DashboardPage.tsx` and test; modify `App.tsx`, `global.css`, `README.md`.

- [ ] Write failing mocked-query tests for household cards, member/list/pending counts, list progress, quick actions, loading/error/empty states and card navigation.
- [ ] Run the focused dashboard test; expect RED because the component is absent.
- [ ] Implement `DashboardPage({ userName, onNavigate })` using existing household/list/item queries. It navigates quick actions to `/households?create=1`, `/lists?create=1`, `/nfc`; it never fakes a mutation. Recent activity uses existing notification data or an explicit empty state.
- [ ] Render it at authenticated `/`, but retain legacy `/?household=...&list=...` direct links into the existing list flow.
- [ ] Verify checks, update README and commit `feat(web): add household dashboard`.

### Task 4: Household, list, NFC and utility routes

**Files:** create `HouseholdsPage.tsx`, `HouseholdDetailPage.tsx`, tests, `features/nfc/NfcPage.tsx`, test; modify `ShoppingListRoute.tsx`, `App.tsx`, `global.css`, `README.md`.

- [ ] Write failing tests for household grid/detail tabs, list grouping, opening a list with exact household/list IDs, profile/settings rendering, and NFC no-false-success behaviour.
- [ ] Run focused route-view tests; expect RED because those views/routes do not exist.
- [ ] Implement `/households`, `/households/:id`, `/lists`, `/lists/:id`, `/nfc`, `/profile` and `/settings`. Embed `MembersPanel` in the household member tab; list detail delegates to `ShoppingListRoute` so optimistic/offline guarantees survive. NFC shows linked-household guidance and truthful unavailable state when management endpoint is absent.
- [ ] Extend client routing while keeping invitation/auth branches and historical notification query links intact. Add responsive card grids and mobile bottom-bar safe area.
- [ ] Verify full suite/typecheck/build/diff, document verified routes and commit `feat(web): add household and list app routes`.

### Task 5: Final review

**Files:** modify `README.md` only for a verified correction.

- [ ] Run `npm run web:dev` and manually check landing modals, shell, profile menu, notifications, mobile navigation, household/list routes and one offline list.
- [ ] Run `npm --workspace @nfcompra/web run test`, typecheck, build and `git diff --check`.
- [ ] If and only if review finds a defect, add a failing regression test, make the smallest correction, re-run checks and commit it. Otherwise create no empty commit.
