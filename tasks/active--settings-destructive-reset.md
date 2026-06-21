# Task: Destructive "Reset all data" button in Settings

## Goal

Add a destructive reset action to the Settings screen that deletes **all
user-created data** — shopping lists, list items, the default list, user-added
items, and aisle overrides — while **preserving the seeded store data** (the
Oxford Market Basket store record, its aisles, and its 182 seeded items in their
original aisles).

## Key constraint & core insight

The `items` object store is **mixed**: it holds both the 182 seeded store items
(from `src/assets/aisles/oxford-62.json`) and items created on the fly when a
user adds a name that isn't already in the catalog (`addListItem` in
`src/hooks/useListItems.ts`). **There is no flag distinguishing the two.**

Likewise, an "override" in this codebase is a user re-categorization that mutates
`item.aisle_id` **in place on the shared global `items` record** (see
`useUpdateItemAisle` in `src/hooks/useItems.ts` and
`tasks/complete--manual-categorize-uncategorized.md`). A seeded item moved to a
different aisle has had its seed value overwritten — there is no separate
override record to delete.

Both problems are solved the same way: **the seed JSON is the canonical pristine
state of the store-managed object stores.** So the reset does not try to
selectively identify "user" rows in `items`. Instead it **clears the
store-managed stores (`stores`, `aisles`, `items`) and re-inserts them verbatim
from the seed file**, which:

- drops user-added items (they aren't in the seed),
- reverts aisle overrides on seeded items (re-added with original `aisle_id`),
- restores the store and aisle catalog to pristine state.

Seed IDs are fixed in the JSON, so `store_id` / `aisle_id` references remain
stable across the reset — no dangling-reference fallout for anything that
survives.

### What gets deleted vs. preserved

| Object store     | Action on reset                          | Why                          |
| ---------------- | ---------------------------------------- | ---------------------------- |
| `shopping_lists` | **cleared**                              | 100% user data               |
| `list_items`     | **cleared**                              | 100% user data               |
| `default_list`   | **cleared**                              | 100% user data               |
| `items`          | **cleared + re-seeded** from JSON        | drops user items, reverts overrides |
| `aisles`         | **cleared + re-seeded** from JSON        | reverts any aisle edits      |
| `stores`         | **cleared + re-seeded** from JSON        | restores pristine store      |

## Interpretation note (flag if wrong)

The request says "lists, items, and overrides." This plan maps:

- **lists** → `shopping_lists` + `list_items` **and** `default_list`,
- **items** → user-added rows in `items`,
- **overrides** → aisle re-categorizations on the shared `items` record.

`default_list` is included because it is purely user-authored data and a "reset"
that left it behind would be surprising. If the default list should be spared,
this is the one line to change in `resetUserData`.

## Relevant ADRs

- **ADR-0002 (IndexedDB for core storage):** all IDB logic stays in `db/`; reset
  is implemented as a single multi-store transaction in `db/idbClient.ts`.
- **ADR-0004 (Zustand + TanStack Query):** the reset is exposed to the UI as a
  TanStack Query mutation hook that invalidates all caches on success. No
  Zustand involvement (no ephemeral state here).

No `DB_VERSION` bump and no schema migration — no new stores or indexes are
introduced, so the append-only `upgrade()` rule is not engaged.

## Implementation

### 1. `src/db/idbClient.ts` — `resetUserData()`

Add and export a `resetUserData()` function. It reuses the existing module-level
`seedData` constant (already parsed from `oxford-62.json`), so the pristine
definition lives in exactly one place.

```ts
export async function resetUserData(): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(
    ['shopping_lists', 'list_items', 'default_list', 'stores', 'aisles', 'items'],
    'readwrite',
  );
  // Queue every op synchronously — idb auto-commits across await boundaries, so
  // no awaits until tx.done. clear() is ordered before the re-seed add()s.
  tx.objectStore('shopping_lists').clear();
  tx.objectStore('list_items').clear();
  tx.objectStore('default_list').clear();
  tx.objectStore('stores').clear();
  tx.objectStore('aisles').clear();
  tx.objectStore('items').clear();

  tx.objectStore('stores').add(seedData.store);
  for (const aisle of seedData.aisles) tx.objectStore('aisles').add(aisle);
  for (const item of seedData.items) tx.objectStore('items').add(item);

  await tx.done;
}
```

Notes:
- Single transaction → atomic. A mid-way failure rolls back; the user never
  lands in a half-wiped state.
- All writes queued synchronously before any `await` (same pattern as
  `addListItem`'s write phase) to avoid premature auto-commit.

### 2. `src/hooks/useResetData.ts` — mutation hook (new file)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetUserData } from '@/db/idbClient';

export function useResetData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetUserData,
    onSuccess: () => {
      // Full data reset — invalidate every cache so all screens refetch.
      queryClient.invalidateQueries();
    },
  });
}
```

Invalidating with no filter refetches `['shopping_lists']`, `['items']`, every
`['list_items', listId]`, etc. — correct because every persistent store changed.

### 3. `src/routes/SettingsRoute.tsx` — Danger Zone UI

- Add a new bottom section (e.g. "Danger Zone" / "Reset") rendered after the
  Default List section.
- A destructive `Button` (`variant="danger"`, full-width) labeled **"Reset all
  data"** with helper text explaining what it does and that it cannot be undone.
- Local `useState` `confirmingReset: boolean` to gate the dialog.
- Reuse the existing `ConfirmDialog` molecule (already imported) with:
  - `title="Reset all data?"`
  - `message`: "All your lists, default list, and added items will be
    permanently deleted. Your store and aisle layout will be restored to
    default. This can't be undone."
  - `confirmLabel="Reset"`, `destructive` (default true → danger button),
  - `isPending={reset.isPending}`,
  - `errorMessage={reset.isError ? 'Reset failed. Please try again.' : undefined}`,
  - `onCancel`: `reset.reset()` + close,
  - `onConfirm`: `reset.mutate(undefined, { onSuccess: close })`.
- Wire `const reset = useResetData();`.

This mirrors the existing delete-list confirm flow already in the file, so the
interaction pattern and a11y (`role="alertdialog"`) are consistent.

## Tests

### Unit — `src/db/__tests__/idbClient.test.ts` (extend)

Using `fake-indexeddb` per the existing setup:

1. **Clears all user data:** seed a `shopping_list`, a `list_item`, and a
   `default_list` entry; call `resetUserData()`; assert all three stores are
   empty.
2. **Drops user-added items but keeps seed items:** add an item with a fresh
   UUID not in the seed; reset; assert `items` count is back to 182 and the
   user item is gone.
3. **Reverts aisle overrides:** `put` a seeded item with a changed `aisle_id`;
   reset; assert that item's `aisle_id` matches the seed value again.
4. **Preserves the store:** assert `stores` count is 1 and name is
   "Oxford Market Basket #62" after reset.

### Unit — `src/hooks/__tests__/useResetData.test.ts` (new)

- Mutation calls `resetUserData` and invalidates queries on success
  (spy on `queryClient.invalidateQueries`).

### Component — `src/routes/__tests__/SettingsRoute.test.tsx` (extend)

- Renders the "Reset all data" button.
- Clicking it opens the confirm dialog **without** mutating (data still present).
- Cancelling closes the dialog and leaves data intact.
- Confirming clears `shopping_lists` / `list_items` and the list cards disappear
  from "Your Lists"; seed `items`/`stores` remain.

### E2E — `npm run test:e2e`

Add/extend a Playwright spec: create a list with items, open Settings, reset via
the confirm dialog, assert the lists list is empty and the store/aisle data
still drives the add-item flow. (Per CLAUDE.md, `validate` does not cover E2E —
run `test:e2e` before calling this done.)

## Out of scope

- No `localStorage` / Zustand persistence to clear (active-store preference is
  still backlog; revisit if/when added).
- No export/backup-before-reset flow.
- No undo.

## Files touched

- `src/db/idbClient.ts` (add `resetUserData`)
- `src/hooks/useResetData.ts` (new)
- `src/routes/SettingsRoute.tsx` (Danger Zone section + dialog)
- `src/db/__tests__/idbClient.test.ts` (extend)
- `src/hooks/__tests__/useResetData.test.ts` (new)
- `src/routes/__tests__/SettingsRoute.test.tsx` (extend)

## Definition of done

- `npm run validate` green (typecheck + lint + unit).
- `npm run test:e2e` green.
- `PLAN.md` updated (status line + remove from active when complete; this task
  file renamed to `tasks/complete--settings-destructive-reset.md`).
