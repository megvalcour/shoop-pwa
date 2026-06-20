## Current Status

feat: aisle matcher accuracy (layered lexical + semantic matching)

## Active Task

Aisle matcher accuracy — see `tasks/active--aisle-matcher-accuracy.md`. Phases 0–3, 5, 6 implemented (root-cause filter removed, pure `classifier.ts` service + alias layer + ADR-0011). **Phase 4 (oxford-62.json data-quality corrections) is deferred pending user confirmation** — see Open Questions in the task file. E2E (`test:e2e`) not runnable in the dev sandbox (Playwright browser download blocked); deterministic seeds mean it should be unaffected — confirm in CI.

## Backlog

### Audit

### Shopping Lists

- Delete shopping list (confirmation prompt, purges the list record and all its `list_items` rows)

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
