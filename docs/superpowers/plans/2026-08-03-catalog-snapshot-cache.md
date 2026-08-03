# Catalog Snapshot Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make product autocomplete fast by downloading a compact catalog snapshot once and searching locally in the PWA.

**Architecture:** The API exposes a version endpoint and a compact snapshot endpoint backed by D1. The PWA keeps an in-memory catalog cache, refreshes it only when needed, and filters products locally for autocomplete. The existing remote search endpoint remains as fallback.

**Tech Stack:** Cloudflare Worker/D1, TypeScript, React, Vitest, IndexedDB not required for this first pass.

## Global Constraints

- Do not use subagents.
- Do not push, deploy, or create PRs without explicit permission.
- Do not add product images or pricing.
- Keep catalog display text accent-free.
- Android implementation is out of this plan; the API contract must be suitable for Android Room later.

---

### Task 1: API snapshot/version endpoints

**Files:**
- Modify: `apps/api/src/catalog/repository.ts`
- Modify: `apps/api/src/catalog/routes.ts`
- Modify: `apps/api/test/catalog.integration.test.ts`

**Interfaces:**
- Produces: `getProductCatalogVersion(env): Promise<{ version: string; productCount: number }>`
- Produces: `listProductCatalogSnapshot(env): Promise<ProductCatalogItem[]>`
- Produces: `GET /v1/product-catalog/version`
- Produces: `GET /v1/product-catalog/snapshot`

- [ ] Write failing API integration tests asserting `/version` returns `productCount` and a stable max `updated_at`, and `/snapshot` returns compact products.
- [ ] Run the API catalog integration test and verify the new tests fail.
- [ ] Implement repository functions and routes.
- [ ] Run the API catalog integration test and verify it passes.

### Task 2: PWA local catalog cache

**Files:**
- Modify: `apps/web/src/features/catalog/product-catalog-api.ts`
- Modify: `apps/web/src/features/catalog/product-catalog-api.test.ts`
- Modify: `apps/web/src/features/shopping-list/ShoppingListScreen.tsx`
- Modify: `apps/web/src/features/shopping-list/ShoppingListScreen.test.tsx`

**Interfaces:**
- Produces: `searchProductCatalog(search: string, limit?: number): Promise<ProductCatalogItem[]>` backed by local cache first.
- Produces: `loadProductCatalogSnapshot(): Promise<ProductCatalogItem[]>`.

- [ ] Write failing tests proving repeated autocomplete searches use one snapshot request and do not call `/product-catalog?search=...`.
- [ ] Write failing screen test proving suggestions still appear from local snapshot.
- [ ] Implement snapshot fetch/cache, local normalized filtering, and remote fallback.
- [ ] Run targeted web tests and verify they pass.

### Task 3: Documentation and verification

**Files:**
- Modify: `README.md`

- [ ] Update README with snapshot/cache behavior and Android follow-up note.
- [ ] Run `npm run api:test`.
- [ ] Run `npx --workspace @nfcompra/api tsc --noEmit`.
- [ ] Run `npm --workspace @nfcompra/web run test`.
- [ ] Run `npm --workspace @nfcompra/web run typecheck`.
