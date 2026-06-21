---
step: 4
substep: 4
status: planning
class: standard
e2e_required: true
clarifications: |
  Scope = "Delete a shopping list" (the next backlog item): delete a whole list
  (a "row" on the Shopping Lists screen in Settings) and purge its list_items.
  Confirmation prompt required.
  Leftover active task (manual-categorize-uncategorized) archived to complete--*.
  Classification: Standard (UI + route + new confirmation interaction).
  Confirmation UX: build a reusable ConfirmDialog molecule (modeled on
  AislePickerSheet's overlay pattern). Not native window.confirm.
  Placement: Settings "Your Lists" cards only (ADR-0012 canonical place). Not the
  list detail header.
  Explicitly OUT of scope: undo / soft-delete, bulk / multi-select delete,
  swipe-to-delete gesture.
---

# Task: Delete a shopping list

## Problem

There is no way to delete a shopping list from the UI. Lists accumulate forever
on the Settings "Your Lists" screen. The data-layer mutation already exists and
is tested — only the UI affordance, a confirmation prompt, and the wiring are
missing.

### Current state (already implemented)

- `src/hooks/useShoppingLists.ts` → `useDeleteShoppingList` is **fully
  implemented**: a single `readwrite` transaction over `['shopping_lists',
  'list_items']` that deletes the list record and every `list_items` row whose
  `list_id` index matches, then invalidates the `['shopping_lists']` and
  `['list_items', id]` query keys. **No hook change needed.**
- It is **not referenced by any `.tsx`** — purely unwired.
- `src/routes/SettingsRoute.tsx` renders each list as a `ShoppingListCard` whose
  only interaction is `onClick → navigate('/lists/:id')`.
- `src/components/molecules/ShoppingListCard.tsx` is a single `<button>` wrapping
  the whole card (a nested delete `<button>` is therefore invalid HTML and needs
  a small restructure).
- Per-item delete (`GroceryListItem` + `useDeleteListItem`) already exists and is
  immediate/unconfirmed — that is the precedent for the trash-icon idiom, but
  whole-list delete adds a confirmation step per the backlog.

### Navigation safety (no change required, but must be verified)

- Delete is invoked from Settings, so the user is never viewing the deleted
  list's detail route at delete time.
- `ShoppingListDetailRoute` already renders "List not found." when a list id is
  absent (ADR-0012 nav stays intact).
- `ShopRoute` redirects to `lists[0]` (most recent remaining) or shows the empty
  state — both correct after a delete because the query is invalidated.

## Relevant ADRs

- **ADR-0009** (on-demand shopping list model): explicitly names `delete` as a
  future story that must use `shopping_lists` + `list_items`. The existing hook
  already complies (purges both stores). No deviation.
- **ADR-0012** (Shop-as-root redirect navigation): Settings is the canonical
  place for list management; `/` and `/lists/:id` behavior after a delete is
  already handled. Placing delete in Settings is consistent. No deviation.
- **ADR-0005** (atomic design): `ConfirmDialog` is a presentational **molecule**
  (composes Button atoms, no store access); the **route** owns the delete hook
  and dialog open/close state. `ShoppingListCard` stays presentational (gains an
  optional `onDelete` prop, no store access).
- **ADR-0008** (design tokens): dialog/button styling uses existing tokens
  (`bg-surface`, `text-destructive`, `border-border`, etc.).

No ADR is contradicted. **No new ADR required** — this introduces no new data
model, API contract, or reused architectural pattern beyond a conventional
confirm dialog (the dialog pattern itself mirrors the accepted AislePickerSheet).

## Approach

Three presentational/wiring pieces; zero data-layer change.

### 1. New molecule — `src/components/molecules/ConfirmDialog.tsx`

Reusable confirmation modal modeled on `AislePickerSheet`'s overlay structure
(`fixed inset-0 z-50`, dimmed backdrop that closes on click), but rendered as a
centered card rather than a bottom sheet.

- Props (interface, strict types):
  - `title: string`
  - `message: string`
  - `confirmLabel?: string` (default `"Delete"`)
  - `cancelLabel?: string` (default `"Cancel"`)
  - `destructive?: boolean` (default `true` → confirm button uses the
    `destructive`-styled affordance; otherwise a primary-styled confirm)
  - `isPending?: boolean` (disables the confirm button while a mutation runs)
  - `onConfirm: () => void`
  - `onCancel: () => void`
- Accessibility: `role="alertdialog"`, `aria-modal="true"`,
  `aria-labelledby`/`aria-describedby` wired to the title/message ids. Backdrop
  click and Cancel both call `onCancel`. Confirm button is `autoFocus` is **not**
  used (avoid accidental destructive default); Cancel is the safe default.
- No business logic, no store/hook access (molecule rule). Uses the `Button`
  atom for both actions.

### 2. `src/components/molecules/ShoppingListCard.tsx`

- Add optional `onDelete?: () => void` prop.
- Restructure so the card is **not** a single button-wrapping-button:
  - Outer `<div>` with the existing card classes + `flex items-center
    justify-between`.
  - Left: a `<button>` (the navigate target) holding the name + date, labeled by
    the list name; keeps `onClick`.
  - Right: when `onDelete` is provided, a destructive trash `Button`
    (`faTrash`, `aria-label={\`Delete list: ${list.name}\`}`) that calls
    `e.stopPropagation()` then `onDelete()` — mirroring `GroceryListItem`.
- When `onDelete` is absent, render exactly as before (no trash button) so other
  callers (if any appear later) are unaffected.

### 3. `src/routes/SettingsRoute.tsx`

- Import `useDeleteShoppingList` and `ConfirmDialog`.
- Add local state `const [pendingDelete, setPendingDelete] = useState<ShoppingList | null>(null)`.
- Pass `onDelete={() => setPendingDelete(list)}` to each `ShoppingListCard`.
- Render `<ConfirmDialog>` when `pendingDelete` is set:
  - `title="Delete list?"`,
    `message={\`"${pendingDelete.name}" and all its items will be permanently deleted.\`}`
  - `isPending={deleteList.isPending}`
  - `onCancel={() => setPendingDelete(null)}`
  - `onConfirm`: call `deleteList.mutate(pendingDelete.id, { onSuccess: () =>
    setPendingDelete(null) })`. (On error, keep the dialog open and surface a
    message — see below.)
- Error handling: surface `deleteList.isError` as an inline `text-destructive`
  message inside the dialog ("Failed to delete. Please try again."), consistent
  with the existing create-error pattern in this route.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/ConfirmDialog.tsx` | **New** reusable confirm modal molecule. |
| `src/components/molecules/ShoppingListCard.tsx` | Add optional `onDelete`; restructure to avoid nested buttons; add destructive trash affordance. |
| `src/routes/SettingsRoute.tsx` | Wire `useDeleteShoppingList` + `ConfirmDialog`; manage `pendingDelete` state and error surfacing. |
| `src/hooks/useShoppingLists.ts` | **No change** (hook already correct). |

## Implementation checklist

- [ ] Create `src/components/molecules/ConfirmDialog.tsx` per the spec above.
- [ ] Update `src/components/molecules/ShoppingListCard.tsx`: add `onDelete`,
      restructure markup, add trash affordance with `stopPropagation`.
- [ ] Update `src/routes/SettingsRoute.tsx`: wire hook + dialog + `pendingDelete`
      state + error surfacing.
- [ ] Unit test: `src/components/molecules/__tests__/ConfirmDialog.test.tsx`.
- [ ] Unit test: `src/components/molecules/__tests__/ShoppingListCard.test.tsx`.
- [ ] Update `src/routes/__tests__/SettingsRoute.test.tsx` with delete-flow cases.
- [ ] Extend `src/hooks/__tests__/useShoppingLists.test.ts` to assert `list_items`
      purge.
- [ ] Extend `e2e/shopping-lists.spec.ts` with the delete-list E2E flow.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` (delete flow) green.

## Tests

### Unit / integration (Vitest + RTL)

- **`ConfirmDialog.test.tsx`** (new):
  - Renders `title` and `message`.
  - Clicking the confirm button calls `onConfirm`; clicking cancel calls
    `onCancel`; clicking the backdrop calls `onCancel`.
  - Confirm button is disabled when `isPending` is true.
  - `role="alertdialog"` is present and labelled by the title.
- **`ShoppingListCard.test.tsx`** (new):
  - Renders a "Delete list: <name>" button only when `onDelete` is provided.
  - Clicking the trash button calls `onDelete` and does **not** call the card's
    `onClick` (stopPropagation holds).
  - Clicking the card body still calls `onClick`.
- **`SettingsRoute.test.tsx`** (extend):
  - Clicking a card's delete affordance opens the confirm dialog (does not delete
    yet).
  - Cancel closes the dialog and the list still renders.
  - Confirm removes the card (list disappears from "Your Lists") via the real
    `useDeleteShoppingList` against fake-indexeddb.
- **`useShoppingLists.test.ts`** (extend the existing `useDeleteShoppingList`
  block): seed a list **with `list_items` rows**, delete it, and assert both the
  `shopping_lists` record and all matching `list_items` rows are gone (the
  backlog's explicit "purge list_items" requirement — currently untested).

### E2E (Playwright) — `e2e/shopping-lists.spec.ts` (extend)

- Create a list via the UI, go to Settings, tap its delete affordance, confirm in
  the dialog, and assert the card disappears from "Your Lists".
- Tap delete then Cancel — assert the list remains.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — delete flow + cancel flow green.

## Out of scope

- Undo / soft-delete (no toast, no trash/restore) — deletion is permanent,
  matching the existing per-item delete.
- Bulk / multi-select deletion — one list at a time.
- Swipe-to-delete gesture — tap-on-trash-icon only.
- A delete affordance on the list **detail** header (Settings cards only).
- Any change to `useDeleteShoppingList` or the data model / schema.
