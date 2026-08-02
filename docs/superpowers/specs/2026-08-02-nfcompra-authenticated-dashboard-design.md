# NFCompra authenticated dashboard design

## Objective

Redesign the authenticated web experience in the existing fresh-green NFCompra
visual system. The public landing also receives two explicit authentication
buttons and describes NFC stickers as an available feature.

This work is presentation and client navigation over the existing household,
list, invitation and notification APIs. It must not alter their payloads or
introduce database changes.

## Product structure

The authenticated app is centred on households:

- **Dashboard (`/`)**: all households at a glance, their active lists and
  pending-item counts, followed by recent activity. It is not tied to one
  selected shopping list.
- **Households (`/households`)**: grid/list of every household the user
  belongs to, with counts and a create-home action.
- **Household detail (`/households/:householdId`)**: household summary and
  tabs for Lists, Members and NFC stickers. Existing member and invitation
  workflows remain available here.
- **My lists (`/lists`)**: active lists grouped by household, with progress
  and links to their detail screens.
- **List detail (`/lists/:listId`)**: the existing shopping-list experience,
  enhanced only by its surrounding shell and breadcrumb/context. Its existing
  optimistic updates and offline behaviour remain unchanged.
- **NFC (`/nfc`)**: a sticker management view, presented as operational:
  linking, naming and unlinking a household sticker. If a backend capability is
  not already available, the visual control must use a clear unavailable/error
  state rather than pretend a write succeeded.

Legacy query links from notifications (`/?household=...&list=...`) remain
supported and resolve directly to the appropriate list context.

## Navigation shell

Desktop uses a fixed top bar inspired by the approved KeystoneSync reference:

`[NFCompra logo + name]  Inicio · Hogares · Mis listas · NFC  [Descargar APK] [notifications] [avatar + name]`

- The logo asset is intended at `apps/web/src/assets/brand/nfcompra-logo.svg`
  (PNG is acceptable if that is the supplied source).
- The **Download APK** action links to an existing release URL only. Until a
  release URL is configured it is visibly disabled or states that it is coming
  soon; it must not claim a download exists.
- The existing notification bell moves into this shell and retains unread
  count, actions and routing behaviour.
- The user trigger opens a labelled menu showing name and email, then Profile,
  Settings and Sign out. Profile and Settings are intentionally presentational
  placeholders in this scope unless corresponding persisted settings already
  exist. Sign out calls the current logout flow.

On mobile, the top bar keeps brand, notification bell and profile. The primary
navigation becomes a bottom bar: **Inicio, Hogares, Listas, NFC**. It must be
touch-friendly, show the current route and leave the shopping-list actions
reachable.

## Dashboard

The dashboard has:

1. a contextual welcome with three quick actions: Create household, New list
   and Scan NFC;
2. **Your households**, a responsive card grid. Each card exposes its name,
   member count, active list count, total pending items, and the most relevant
   lists with completed/total progress;
3. **Recent activity**, derived only from existing known data or shown as an
   explicit empty state when no API supplies activity; and
4. an empty state that preserves the current first-household creation flow.

Cards and quick actions navigate through client routes, never reload the page.
Loading, error and zero-data states are explicit.

## Public landing adjustments

- The header contains adjacent **Iniciar sesión** and **Registrarse** buttons;
  each opens its corresponding accessible authentication modal.
- NFC copy says the sticker opens the household's shopping context and is
  ready to use. It must not call the feature upcoming.

## Visual and accessibility rules

- Preserve the Fresh + NFC palette: forest `#10271e`, green `#1c7144`, lime
  `#dcff72`, off-white `#f8fcf9`.
- Use clear cards, compact badges/progress and sufficient touch targets.
- Menus, notification panel and mobile navigation are keyboard accessible;
  profile menus close on Escape and outside interaction and restore focus to
  their trigger.
- Existing authentication modals retain their complete focus trap.
- Responsive breakpoint is mobile-first; no core action depends on hover.

## Tests and verification

- Add route, shell and interaction tests for dashboard cards, profile menu,
  notification positioning/behaviour and mobile navigation semantics.
- Preserve coverage of direct authentication, invitation and notification
  routes plus list offline/optimistic behaviour.
- Run the full web test suite, TypeScript type check, production build and
  `git diff --check` before a local commit.
- Update README only after these checks pass and only with verified commands
  and capabilities.

## Deliberate exclusions

- No profile/settings persistence or new registration fields.
- No new API/D1 migration in this visual/navigation milestone.
- No external deployment, release upload or GitHub push without separate
  explicit authorization.
