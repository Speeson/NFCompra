# NFCompra household and list polish design

## Goal

Apply the approved compact-panel visual treatment to Household, My Lists and
shopping-list detail views while preserving all existing API, route, offline
and mutation behaviours.

## Households and lists

- Both routes use the same `route-page__header` pattern: eyebrow, title,
  supporting copy and primary creation button.
- Household/list cards are centred in responsive compact grids and show their
  key metadata in a consistent hierarchy.
- Cards remain keyboard/touch accessible and preserve existing open/create
  actions.

## Shopping-list detail

- Household/list selectors and new-list control become a compact context
  header; member controls sit in their own clearly separated panel.
- The quick product form becomes a distinct add-product panel above the list.
  It exposes Product and Quantity; Unit moves to the edit form only.
- Pending and purchased products have labelled section headers.
- Each product row has a transparent square checkbox. Checked products show
  a green tick only, with green struck-through name/quantity.
- Product actions move right into square icon buttons matching checkbox size:
  green outlined pencil for edit and soft-red outlined X for delete.
- Future product icons are not implemented; the layout reserves no fake
  product icon data.

## Constraints and verification

- Do not change API, database, data models or existing optimistic/offline
  list semantics.
- Keep add/edit/delete/toggle behaviours and their accessible labels.
- Add focused tests for quick add fields and product-row checkbox/action
  semantics; run full web tests, typecheck, production build and diff check.
- No remote operation without separate authorization; README only after
  verified changes.
