## Current Status

`feat(db): align initial semver minor with DB_VERSION 4 — adopt semantic-release for automated semver from conventional commits and enforce minor(appVersion) === DB_VERSION in CI (ADR-0016)`

## Active Task

_None. Promote a backlog item to active to begin the next task._

## Backlog

### Default List

- Users can create a store-agnostic default list in Settings; new list action includes option to start from scratch or from default list as base.

### Store Switcher

- Create Settings screen with active store selector (reads from `stores` object store)
- Implement `useStores` hook (list stores, set active store in Zustand UI state)
- Persist active store choice across sessions (write to a `preferences` key in IndexedDB)
- Re-scope shopping list and aisle views to the active store's aisles on store change
