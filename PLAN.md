## Current Status

`feat(db): bootstrap IndexedDB foundation with schema, migrations, Oxford seed data, and Vitest setup`

## Active Task

None.

## Backlog

### Weekly List

- Scaffold app shell with bottom nav and route stubs (Weekly, Default List, Settings); includes Tailwind scaffold
- Create weekly list screen showing empty state with a "New List" prompt
- Implement `useWeeklyList` hook (create, read, delete a list by week_start)
- Build `AddItemForm` organism — text input + submit, writes item to `items` store and adds to `weekly_list`
- Render `WeeklyListBuilder` organism — scrollable list of added items with inline delete
- Wire item check-off: toggle `checked` on a `weekly_list` row with optimistic update
- Delete weekly list (confirmation prompt, purges all rows for that week)

### Smart Aisle Location (Market Basket 62)

- Build `useAisleMatcher` hook that loads `Xenova/all-MiniLM-L6-v2` via WASM and exposes a `classify(itemName)` → `aisleId` function
- Pre-compute and cache aisle embeddings from `oxford-62.json` on first model load
- Integrate matcher into `AddItemForm`: resolve aisle on submit, store `aisle_id` on the `items` row
- Group `WeeklyListBuilder` items by aisle with `AisleGroup` molecule, sorted by `sort_order`
- Show aisle badge on each `GroceryItem` molecule; allow manual aisle override

### Default List

- Create default list screen with empty state
- Implement `useDefaultList` hook (add, remove, reorder items)
- Build `DefaultListEditor` organism — editable list of default items with drag-to-reorder
- "Copy to weekly list" button — bulk-inserts default items into the current week's `weekly_list`
- Skip items already present in the weekly list when pre-populating (de-dupe by `canonical_name`)

### Store Switcher

- Create Settings screen with active store selector (reads from `stores` object store)
- Implement `useStores` hook (list stores, set active store in Zustand UI state)
- Persist active store choice across sessions (write to a `preferences` key in IndexedDB)
- Re-scope weekly list and aisle views to the active store's aisles on store change
