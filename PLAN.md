## Current Status

feat: Redesign based off of Claude Design

## Active Task

None

## Backlog

### Audit

### Shopping Lists

- Let user categorize uncategorizable items (aisle picker removed from item rows in the design overhaul).
- Most
- Delete shopping list (confirmation prompt, purges the list record and all its `list_items` rows)
- Edit item quantity on the shopping list (display/edit removed in the design overhaul; data model still stores it)

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
