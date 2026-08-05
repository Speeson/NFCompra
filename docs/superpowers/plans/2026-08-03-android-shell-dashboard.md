# Android Shell Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Android authenticated shell and dashboard so the app has clear navigation before deeper screen redesign.

**Architecture:** Keep existing `ShoppingListViewModel` and repository contracts. Refactor authenticated `ShoppingListApp` rendering into focused Compose components inside `ShoppingListScreen.kt`, with state-driven tabs for Inicio, Hogares and Listas.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, existing Android modules, existing Compose test stack.

## Global Constraints

- Do not use subagents.
- Do not push, deploy, send email, create PRs or use external credentials.
- Keep current API contracts unchanged.
- Update `README.md` only with verified Android local state.

---

### Task 1: Dashboard UI tests

**Files:**
- Modify: `apps/android/feature/shoppinglist/src/androidTest/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreenTest.kt`

**Interfaces:**
- Consumes: `ShoppingListViewState.Data`, `HouseholdUiModel`, `ShoppingListSummaryUiModel`, `ShoppingListUiState`
- Produces: failing tests for authenticated dashboard rendering

- [ ] Add a Compose test that renders the data state through a pure `ShoppingListContent` composable and asserts `Inicio`, `Hogares`, `Listas`, selected household and selected list are visible.
- [ ] Add a Compose test for a selected household with no lists and assert “No hay listas asociadas a este hogar.” plus “Crear lista”.
- [ ] Run `.\gradlew.bat --no-daemon :feature:shoppinglist:compileDebugAndroidTestKotlin` and confirm the tests fail because `ShoppingListContent` does not exist yet.

### Task 2: Authenticated shell and dashboard

**Files:**
- Modify: `apps/android/feature/shoppinglist/src/main/java/dev/esgarpe/nfcompra/feature/shoppinglist/ShoppingListScreen.kt`

**Interfaces:**
- Produces: `@Composable internal fun ShoppingListContent(data: ShoppingListViewState.Data, onAction: (ShoppingListAction) -> Unit, onLogout: () -> Unit, onMembers: (String) -> Unit)`

- [ ] Extract current `Data` rendering from `ShoppingListApp` into `ShoppingListContent`.
- [ ] Add local tab state with `Inicio`, `Hogares`, `Listas`.
- [ ] Implement compact dashboard cards for hogares and listas.
- [ ] Preserve dialogs for creating household/list, renaming list and deleting list.
- [ ] Preserve selected-list rendering through existing `ShoppingListScreen`.
- [ ] Run shoppinglist unit and Android compile checks.

### Task 3: README and verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: verified Gradle commands
- Produces: documented Android shell/dashboard status

- [ ] Update README Android status line with shell/dashboard if verified.
- [ ] Run `.\gradlew.bat --no-daemon :feature:shoppinglist:testDebugUnitTest :feature:shoppinglist:compileDebugAndroidTestKotlin :app:assembleDebug`.
- [ ] Run `git diff --check`.
