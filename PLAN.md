## Current Status

`feat(stores): manually sort aisles via drag-and-drop on the store detail view — persists new order by rewriting Aisle.sort_order, so every aisle-consuming surface follows`

## Active Task

Implement ADR-0016 (holistic versioning) — see `tasks/active--holistic-versioning-system.md`. Adopt semantic-release for automated semver from conventional commits and enforce `minor(appVersion) === DB_VERSION` in CI.

## Backlog

### Default List

- Users can create a store-agnostic default list in Settings; new list action includes option to start from scratch or from default list as base.

### Store Switcher

- Create Settings screen with active store selector (reads from `stores` object store)
- Implement `useStores` hook (list stores, set active store in Zustand UI state)
- Persist active store choice across sessions (write to a `preferences` key in IndexedDB)
- Re-scope shopping list and aisle views to the active store's aisles on store change
