---
step: 10
substep: 1
status: final_checks
class: standard
e2e_required: true
code_review_level: medium
clarifications: |
  Delete affordance: trash icon button, always visible on each row
  Confirmation: instant deletion, no confirmation prompt
  Route scope: replace existing inline ul/GroceryListItem rendering in ShoppingListDetailRoute
---

# ShoppingListBuilder Organism — Scrollable List with Inline Delete

## Relevant ADRs

- **ADR-0004** — TanStack Query for persistent data; Zustand for ephemeral UI state only
- **ADR-0005** — Atomic Design: ShoppingListBuilder is an organism (may import hooks); GroceryListItem is a molecule (receives callbacks, no store access)
- **ADR-0007** — Font Awesome Free for icons; use `faTrash` from `@fortawesome/free-solid-svg-icons`
- **ADR-0009** — All list writes target `list_items` store with fields: `id, list_id, item_id, quantity, checked, added_from_default`

## Implementation Checklist

### 1. Add `useDeleteListItem` mutation to `src/hooks/useListItems.ts`

- [x] Export `useDeleteListItem()` — accepts `{ id: string; listId: string }`
- [x] `mutationFn`: calls `db.delete('list_items', id)`
- [x] Optimistic update in `onMutate`: (1) `await queryClient.cancelQueries({ queryKey: listItemsKey(listId) })` to prevent in-flight refetches from overwriting optimistic state, (2) snapshot existing cache, (3) remove the item from the `list_items` cache for `listId` immediately, (4) return `{ snapshot }` as context
- [x] `onError`: restore snapshot via `queryClient.setQueryData(listItemsKey(listId), context?.snapshot)`
- [x] `onSettled`: `queryClient.invalidateQueries({ queryKey: listItemsKey(listId) })` to sync with IDB

### 2. Extend `GroceryListItem` molecule (`src/components/molecules/GroceryListItem.tsx`)

- [x] Add `onDelete?: () => void` to the props interface
- [x] When `onDelete` is provided, render a `<button>` with `<FontAwesomeIcon icon={faTrash} />` on the right side of the row
- [x] Style: `text-destructive`, small touch target (`p-1`), `aria-label="Delete item"`
- [x] When `onDelete` is undefined, the button is not rendered (no visual change for existing usages)

### 3. Create `ShoppingListBuilder` organism (`src/components/organisms/ShoppingListBuilder.tsx`)

- [x] Props interface: `{ listId: string }`
- [x] Call `useListItems(listId)`, `useItems()`, and `useDeleteListItem()`
- [x] Build `nameById` map via `new Map((items ?? []).map(...))` — use `items ?? []` so the map is empty (not undefined) while `useItems` is still loading; items will show "Unknown item" briefly and update when resolved (matches current route pattern)
- [x] Loading state tied to `useListItems.isPending` only: render `<span className="text-text-muted">Loading…</span>`
- [x] Error state (`useListItems.isError`): render `<span className="text-destructive">Failed to load items.</span>`
- [x] Empty state: render `<p className="text-text-muted mt-4">No items yet.</p>`
- [x] List state: render `<ul className="flex flex-col gap-2">` of `GroceryListItem` molecules, each with an `onDelete` callback that fires `deleteItem.mutate({ id: li.id, listId })`
- [x] Wrap in `<div className="mt-4">` to match current route spacing

### 4. Update `ShoppingListDetailRoute` (`src/routes/ShoppingListDetailRoute.tsx`)

- [x] Remove `useItems` import (now handled inside organism)
- [x] Remove the `nameById` map construction
- [x] Remove the inline `{listItems && ...}` conditional and `<ul>` block
- [x] Import and render `<ShoppingListBuilder listId={id} />` in place of the removed block
- [x] Remove `useListItems` import (now handled inside organism)

### 5. Unit tests — `useDeleteListItem` (add to `src/hooks/__tests__/useListItems.test.ts`)

- [x] Add `describe('useDeleteListItem', ...)` block with `beforeEach` resetting IDB
- [x] Test: deletes the `list_items` row from IDB on success
- [x] Test: `useListItems` query shrinks by 1 after delete settles (cache invalidation via `onSettled`)
- [x] _(Optimistic intermediate-state testing is not feasible with `fake-indexeddb` — no async delay controls. Skip the "before IDB resolves" assertion.)_

### 6. Unit tests — `ShoppingListBuilder` (`src/components/organisms/__tests__/ShoppingListBuilder.test.tsx`)

- [x] Create `src/components/organisms/__tests__/` directory

- [x] Mock `useListItems`, `useItems`, `useDeleteListItem` (vi.mock at module level)
- [x] Test: renders item names from the resolved items map
- [x] Test: renders empty state when `listItems` is `[]`
- [x] Test: renders loading state when `isPending` is true
- [x] Test: clicking the trash button calls `deleteItem.mutate` with the correct `{ id, listId }`

### 7. E2E test — delete interaction (add to `e2e/shopping-lists.spec.ts`)

- [x] Add test: add an item to a list, then click its delete button; verify item disappears from the list

**Review**: Issues found and fixed — `cancelQueries` added to optimistic update, loading state tied explicitly to `useListItems.isPending`, unreachable optimistic-intermediate test dropped, `organisms/__tests__/` directory creation added. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.

**Security Review**: No issues found. IndexedDB key lookups have no injection risk, JSX auto-escapes names, optimistic rollback is correct. Ready for code review.

**Code Review (medium)**: 5 findings fixed — (1) useDeleteShoppingList now invalidates ['list_items', id] cache on success; (2) ShoppingListBuilder guards on !items before rendering list to prevent 'Unknown item' flash; (3) onError in useDeleteListItem guards against undefined snapshot; (4) removed stale 'Finding N:' comments from useListItems; (5) removed unreachable !listItems guard (now covered by finding 2's guard). Ready for final checks.
