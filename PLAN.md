## Current Status

feat: add shopping lists index screen, useShoppingLists hook, and ShoppingListCard molecule

## Active Task

`tasks/active--add-item-form.md` — Build `AddItemForm` organism

## Backlog

### Shopping Lists

- Render `ShoppingListBuilder` organism — scrollable list of added items for the active list with inline delete
- Wire item check-off: toggle `checked` on a `list_items` row with optimistic update
- Delete shopping list (confirmation prompt, purges the list record and all its `list_items` rows)

### Smart Aisle Location (Market Basket 62)

- Build `useAisleMatcher` hook that loads `Xenova/all-MiniLM-L6-v2` via WASM and exposes a `classify(itemName)` → `aisleId` function
- Pre-compute and cache aisle embeddings from `oxford-62.json` on first model load
- Integrate matcher into `AddItemForm`: resolve aisle on submit, store `aisle_id` on the `items` row
- Group `ShoppingListBuilder` items by aisle with `AisleGroup` molecule, sorted by `sort_order`
- Show aisle badge on each `GroceryItem` molecule; allow manual aisle override

### Default List

- Create default list screen with empty state
- Implement `useDefaultList` hook (add, remove, reorder items)
- Build `DefaultListEditor` organism — editable list of default items with drag-to-reorder
- "Copy to list" button — creates a new shopping list and bulk-inserts all default items into it as `list_items`
- Skip items already present in the target list when pre-populating (de-dupe by `canonical_name`)

### Store Switcher

- Create Settings screen with active store selector (reads from `stores` object store)
- Implement `useStores` hook (list stores, set active store in Zustand UI state)
- Persist active store choice across sessions (write to a `preferences` key in IndexedDB)
- Re-scope shopping list and aisle views to the active store's aisles on store change
