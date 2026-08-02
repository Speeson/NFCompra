# NFCompra Household and List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish household, list and shopping-list views with the approved compact-panel layout.

**Architecture:** Keep the existing data/mutations intact; reshape the existing route components and shopping-list screen with focused markup, CSS and tests.

**Tech Stack:** React, TypeScript, Vitest, Testing Library and CSS.

## Global Constraints

- Do not change API, database, models, optimistic mutations or offline semantics.
- Quick add exposes Product and Quantity only; Unit remains in edit.
- A checked row shows a green tick without filled checkbox and green struck-through content.
- Edit/delete are same-size square icon buttons; delete is visually destructive.
- README only after verified changes; no remote operation.

---

### Task 1: Route headers and compact cards

**Files:** modify `HouseholdsPage.tsx`, `ListsPage.tsx`, their tests, `global.css`, `README.md`.

- [ ] Write failing tests for shared route header copy/action and list-card metadata/action grouping.
- [ ] Run focused route tests; expect assertion failure on the old layout.
- [ ] Implement consistent headers, centred responsive card grids and ordered card metadata without changing navigation or queries.
- [ ] Run focused/full web tests, typecheck, build and diff check; update README after green checks; commit `feat(web): polish household and list routes`.

### Task 2: Shopping-list composition and product rows

**Files:** modify `ShoppingListScreen.tsx`, its tests, `ShoppingListRoute.tsx`, `global.css`, `README.md`.

- [ ] Write failing tests that quick add has Product/Quantity but no Unit, checkbox renders green tick only when checked, checked text is styled, and Edit/Delete have square labelled icon controls.
- [ ] Run focused shopping-list tests; expect failure on the current Unit input and text buttons.
- [ ] Implement context/member header panels, separate add-product panel, section headers and compact rows. Keep Unit in edit forms and preserve add/toggle/update/delete callbacks.
- [ ] Run focused/full web tests, typecheck, build and diff check; update README after green checks; commit `feat(web): refine shopping list layout`.

### Task 3: Final review

- [ ] Manually inspect desktop/mobile layout and keyboard controls with `npm run web:dev`.
- [ ] Run full web suite, typecheck, build and diff check; commit only a test-backed correction.
