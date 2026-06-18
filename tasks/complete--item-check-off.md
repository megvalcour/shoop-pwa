---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: true
code_review_level: low
clarifications: |
  Checked items: strikethrough text + sink to bottom of list (below all unchecked items)
  Tap target: whole row tap toggles checked state
  Clear all checked: out of scope
---

# Item Check-Off

Wire per-item check-off on shopping list detail: toggle `checked` on a `list_items` row with optimistic update.

## Relevant ADRs

- **ADR-0002** — IndexedDB for core storage (write target for toggle)
- **ADR-0004** — Zustand + TanStack Query (optimistic mutation pattern; mirrors `useDeleteListItem`)
- **ADR-0009** — On-demand shopping list model (defines `list_items` schema with `checked: boolean`)

## Implementation Checklist

### 1. Hook — `useToggleListItem` mutation

- [x] Add `useToggleListItem` to `src/hooks/useListItems.ts`
  - `mutationFn`: read `list_items` row from IDB by id, `db.put` with `checked` flipped
  - `onMutate` (optimistic): cancel queries → snapshot → flip `checked` on matching row in cache
  - `onError`: restore snapshot
  - `onSettled`: invalidate `listItemsKey(listId)`

### 2. Molecule — `GroceryListItem` visual update

- [x] Add props to `GroceryListItem` in `src/components/molecules/GroceryListItem.tsx`:
  - `checked?: boolean`
  - `onToggle?: () => void`
- [x] When `checked=true`: apply `line-through` to name `<span>`, `opacity-60` to the `<li>`
- [x] When `onToggle` provided: add `onClick={onToggle}` and `cursor-pointer select-none` to `<li>`
- [x] Delete button: add `e.stopPropagation()` to its `onClick` to prevent triggering row toggle

### 3. Organism — `ShoppingListBuilder` wiring

- [x] Import and call `useToggleListItem` in `src/components/organisms/ShoppingListBuilder.tsx`
- [x] Sort rendered items: `[...listItems].sort((a, b) => Number(a.checked) - Number(b.checked))` (unchecked first, stable)
- [x] Pass `checked={li.checked}` and `onToggle={() => toggleItem.mutate({ id: li.id, listId })}` to each `GroceryListItem`

### 4. Unit tests — `useToggleListItem`

- [x] Add `describe('useToggleListItem')` block to `src/hooks/__tests__/useListItems.test.ts`
  - Seed rows directly via `dbPromise` (`db.add('list_items', { ... })`) — do NOT use `useAddListItem` in setup, which requires a `stores` row and would throw
  - It flips `checked` from `false` to `true` in IDB
  - A second call flips it back to `false`
  - `useListItems` query reflects the updated state after toggle settles

### 5. Unit tests — `GroceryListItem` checked state

- [x] Create `src/components/molecules/__tests__/GroceryListItem.test.tsx`
  - Renders without `checked` prop — no `line-through` class
  - Renders with `checked=true` — name element has `line-through` class
  - Clicking the row calls `onToggle`
  - Clicking the delete button does NOT call `onToggle`

### 6. Unit tests — `ShoppingListBuilder` sorting + toggle

- [x] Update `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx`
  - Mock `useToggleListItem`; add it to the mock factory for `@/hooks/useListItems`
  - Add test: checked item renders after unchecked item in DOM order
  - Add test: clicking a row calls `toggleItem.mutate` with correct args

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Validation**: typecheck + lint pass. 35/36 tests pass; 1 pre-existing failure (`useAddListItem > creates a new items row`) confirmed pre-existing. Ready for security review.

**Security Review**: Clean — no injection surface, XSS safe, event propagation correct, optimistic update integrity confirmed. Ready for code review.

### 7. E2E test — check-off flow

- [x] Add `test.describe('Item check-off')` block to `e2e/shopping-lists.spec.ts`
  - Create list → add two items → click first item row → verify first item appears last (after second) and has `line-through` styling
  - Click the checked item again → verify it returns to top and strikethrough is removed

**Final Checks**: 36/36 unit tests pass, 13/13 E2E pass. Fixed a secondary-sort bug: `getAllFromIndex` returns items in UUID key order (random), so added `created_at: number` to `ListItem` and used it as a tiebreaker in the sort so unchecked items maintain insertion order.
