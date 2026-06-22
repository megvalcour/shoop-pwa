# Task: Default List

## Problem

Users repeat the same staples on most shopping trips, but every new list today
starts empty (`useCreateShoppingList` creates a `shopping_lists` row with no
items). The backlog requirement:

> Users can create a store-agnostic **default list** in Settings; the new-list
> action includes an option to start **from scratch** or **from the default
> list** as a base.

This task delivers two capabilities:

1. **A managed default list** — a store-agnostic template of catalog items,
   editable from Settings → Default List (the `/default-list` route, currently a
   placeholder).
2. **Seed-on-create** — when starting a new list, the user chooses *scratch* or
   *from default*; the latter copies the default list's items into the new list.

## Current State

- **Schema already supports this.** `default_list` object store and the
  `DefaultListEntry` interface (`id, item_id, quantity, unit, notes`) exist in
  `src/db/schema.ts`. `list_items.added_from_default` already exists. **No
  `DB_VERSION` bump or migration is required.**
- `DefaultListRoute` (`src/routes/DefaultListRoute.tsx`) is a placeholder; the
  route is wired in `src/App.tsx` and linked from `SettingsRoute` ("Manage
  default items").
- New lists are created via `useCreateAndNavigateToList` → `useCreateShoppingList`
  (no args, no items), triggered by FABs in **both** `ShopRoute` and
  `SettingsRoute`.
- `resetUserData` already clears `default_list`, so reset semantics are covered.

## ADR Constraints

- **ADR-0009 (on-demand lists)** — explicitly designed `added_from_default` *now*
  so "Copy default list" needs no schema change. This task is the realisation of
  that intent. No deviation.
- **ADR-0015 (store-agnostic items + active store)** — items are store-agnostic;
  per-store aisle placement lives in `item_locations`. The default list is
  therefore **just a set of catalog item references** — it stores no aisle data.
  Aisle classification of seeded items happens per-store after they land in a
  real list (see Phase 4).

**No new ADR required** — the design lives entirely within ADR-0009 and ADR-0015.
If the default-list semantics warrant a record later, that's a follow-up; do not
block this task on it.

## Design Decisions (defaults chosen — flag if you disagree)

- **Editor is a flat, store-agnostic list.** No aisle grouping in the
  default-list editor (aisles are per-store; the default list is store-agnostic).
  Add an item, remove an item. This keeps the editor simple and correct.
- **Quantity defaults to `1`.** `unit` and `notes` remain in the schema but are
  **not** surfaced in v1 (empty string). A quantity stepper is optional polish,
  deferred unless trivial. Seeded list items inherit the default entry's
  quantity.
- **The chooser appears only when the default list is non-empty.** With an empty
  default list, the FAB creates a scratch list immediately (today's behaviour) —
  no dead "from default" option.
- **Dedupe by `item_id`.** Adding an item already in the default list is a no-op,
  mirroring the per-list dedupe in `useAddListItem`.

## Implementation Plan

### Phase 1 — Shared catalog find-or-create helper

`useAddListItem` (in `useListItems.ts`) contains the find-or-create-catalog-item
logic inline. The default-list add path needs the same behaviour. Extract it so
both call sites stay in lockstep.

- **New** `src/db/items.ts` (or a small exported helper in `useItems.ts`): an
  async `findOrCreateItem(db, name)` that, given a trimmed name, returns
  `{ itemId, itemCreated }`, creating the catalog `items` row when the canonical
  name is new. This is pure DB logic, so `db/` is the correct home per CLAUDE.md
  ("all IndexedDB logic lives in `db/` and `hooks/`").
- **Refactor** `useListItems.addListItem` to call the helper. Preserve the
  existing in-flight guard, the per-list dedupe, and the single-transaction write
  semantics — this is a behaviour-preserving extraction. Re-run the existing
  `useListItems` tests to confirm no regression.

> If extraction risks destabilising the carefully-tuned `useAddListItem`
> transaction logic, fall back to duplicating the find-or-create read phase in
> the default-list hook and leave `useListItems` untouched. Correctness over DRY.

### Phase 2 — `useDefaultList` hook

**New** `src/hooks/useDefaultList.ts` (TanStack Query, query key
`['default_list']`):

- `useDefaultList()` — `getAll('default_list')`. Returns entries; the editor
  joins to `items` (via `useItems`) for display names, same pattern as
  `ShoppingListBuilder`.
- `useAddDefaultListItem()` — input `{ name }`. Find-or-create the catalog item
  (Phase 1), dedupe against existing `default_list` rows by `item_id`, then
  `add('default_list', { id: crypto.randomUUID(), item_id, quantity: 1, unit:
  '', notes: '' })`. Invalidate `['default_list']` and (when an item was created)
  `['items']`.
- `useRemoveDefaultListItem()` — input `{ id }`. `delete('default_list', id)`.
  Optimistic update + rollback, mirroring `useDeleteListItem`. Removing from the
  default list **does not** touch any existing shopping list.

**Tests** in `src/hooks/__tests__/useDefaultList.test.ts`: add creates catalog
item + entry; add existing catalog item reuses item; duplicate add is a no-op;
remove deletes only the entry.

### Phase 3 — `DefaultListEditor` organism + route

CLAUDE.md already names `DefaultListEditor` as the intended organism.

- **New** `src/components/organisms/DefaultListEditor.tsx`:
  - An add form (text input + Add button). The active-store aisle classifier is
    **not** needed here — the default list stores no aisle data, and seeded items
    classify per-store later. Use a lightweight local form, not the full
    `AddItemForm` (which is `listId`/classifier-coupled).
  - Renders entries by reusing the **`GroceryListItem`** molecule: pass `name`,
    `quantity`, and `onDelete`; omit `onToggle`/aisle props (store-agnostic, no
    check-off in the template). Empty state: "No default items yet."
- **Rewrite** `src/routes/DefaultListRoute.tsx` to render a titled section +
  `<DefaultListEditor />`, matching the visual language of
  `ShoppingListDetailRoute`.

**Tests** in `src/components/organisms/__tests__/DefaultListEditor.test.tsx`: add
flow, remove flow, empty state.

### Phase 4 — Seed-on-create

- **Extend** `useCreateShoppingList` to accept `{ seedFromDefault?: boolean }`.
  When true, after inserting the `shopping_lists` row, read all `default_list`
  entries and bulk-insert `list_items` (one per entry) with
  `added_from_default: true`, `checked: false`, `quantity` from the entry,
  `created_at: Date.now()`. Do the list row + all seeded items in **one
  read-write transaction** over `['shopping_lists', 'list_items']`, queued
  synchronously (idb auto-commits across awaits — same discipline as
  `addListItem`'s write phase). Invalidate `['shopping_lists']` and the new
  list's `['list_items', id]`.
- **Extend** `useCreateAndNavigateToList.createAndNavigate(opts?)` to forward
  `{ seedFromDefault }`.
- **Aisle classification of seeded items is automatic.** Seeded `list_items`
  reference existing catalog items. On the list detail page, `AddItemForm`'s
  ready-effect already classifies every catalog item lacking an
  `item_location` at the active store (the "re-aisle" effect). Items with an
  existing location at the active store bucket immediately; the rest classify on
  matcher-ready. **No extra classification code needed** — verify this in Phase 6.

**Tests**: extend `useShoppingLists` tests — `seedFromDefault: true` copies every
default entry as a `list_item` with `added_from_default: true`; `false`/omitted
creates an empty list (regression).

### Phase 5 — New-list chooser UI

When the default list is non-empty, the FAB must offer scratch vs. from-default.

- **New** `src/components/organisms/NewListFab.tsx` — encapsulates the FAB +
  chooser so `ShopRoute` and `SettingsRoute` don't duplicate the logic (it uses
  hooks, so it's an organism, not a molecule, per the atomic-design rules).
  - Reads `useDefaultList()` for the count.
  - If empty → tapping the FAB calls `createAndNavigate()` directly (today's
    behaviour).
  - If non-empty → tapping opens a chooser (reuse/extend the `ConfirmDialog`
    molecule, or a small bottom-sheet molecule `NewListSheet`) with **"Start from
    scratch"** and **"Start from default list"**; each calls
    `createAndNavigate({ seedFromDefault })`.
  - Carries the existing `disabled`/error states from
    `useCreateAndNavigateToList`.
- **Replace** the inline FAB JSX in `ShopRoute` and `SettingsRoute` with
  `<NewListFab />`. Keep each route's existing positioning classes
  (`fixed bottom-20 right-6 …`) inside the organism.

**Tests**: `NewListFab` — empty default → one tap creates scratch (no dialog);
non-empty default → dialog appears, each choice calls create with the right flag.
Update `ShopRoute`/`SettingsRoute` tests for the extracted FAB.

### Phase 6 — Verification

- `npm run validate` (typecheck + lint + Vitest).
- Manual / Playwright walk-through (offline-first, single device):
  1. Settings → Default List → add 3 items → they persist on reload.
  2. New list → "Start from default" → all 3 appear, each settling into its aisle
     at the active store (no permanent "Uncategorized" for known items).
  3. New list → "Start from scratch" → empty list.
  4. Empty the default list → FAB creates a scratch list with no chooser.
  5. Remove an item from the default list → existing lists are unaffected.
  6. Reset all data → default list is cleared (already handled by
     `resetUserData`).
- **E2E**: add an `e2e/` spec covering add-to-default and create-from-default.
  Note: the E2E suite is currently disabled in CI (see backlog); run locally with
  `npm run test:e2e`.

## Files Touched

| File | Change |
| --- | --- |
| `src/db/items.ts` *(new)* or `useItems.ts` | `findOrCreateItem` helper (Phase 1) |
| `src/hooks/useListItems.ts` | Use shared helper (Phase 1) |
| `src/hooks/useDefaultList.ts` *(new)* | Default-list query + add/remove (Phase 2) |
| `src/components/organisms/DefaultListEditor.tsx` *(new)* | Editor UI (Phase 3) |
| `src/routes/DefaultListRoute.tsx` | Render the editor (Phase 3) |
| `src/hooks/useShoppingLists.ts` | `seedFromDefault` on create (Phase 4) |
| `src/hooks/useCreateAndNavigateToList.ts` | Forward `seedFromDefault` (Phase 4) |
| `src/components/organisms/NewListFab.tsx` *(new)* | FAB + chooser (Phase 5) |
| `src/components/molecules/NewListSheet.tsx` *(new, optional)* | Chooser dialog (Phase 5) |
| `src/routes/ShopRoute.tsx`, `src/routes/SettingsRoute.tsx` | Use `<NewListFab />` (Phase 5) |
| `__tests__/*` | Hook, organism, route tests (each phase) |

## Edge Cases

- **Empty default list** → chooser suppressed; FAB behaves as today.
- **Duplicate add** to the default list → no-op (dedupe by `item_id`).
- **Default item already located at active store** → seeded list item buckets
  immediately, no classify round-trip.
- **Default item not yet located at active store** → classifies via the existing
  `AddItemForm` ready-effect on the detail page (verify in Phase 6).
- **Removing a default item** is a template edit only — never mutates existing
  `shopping_lists` / `list_items`.
- **Offline** — every operation is IndexedDB + TanStack Query; no network in any
  path. Seeding is a single local transaction.

## Out of Scope

- Editing `unit` / `notes` on default entries (schema-present, UI deferred).
- Reordering the default list.
- Seeding a new list from an *existing* list (the backlog item is scratch vs.
  default only).
- Re-enabling the E2E pipeline (separate backlog item).
