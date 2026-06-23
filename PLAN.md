## Current Status

`feat(db): align initial semver minor with DB_VERSION 4 — adopt semantic-release for automated semver from conventional commits and enforce minor(appVersion) === DB_VERSION in CI (ADR-0016)`

## Active Task

**Default List** — a store-agnostic default list managed in Settings; the new-list
action offers starting from scratch or seeding from the default list. Plan:
`tasks/active--default-list.md`.

## Backlog

### Inline Categorization Indicator

- Distinguish an item that is actively being categorized (spinner) from one that is settled-uncategorized (tappable Categorize badge). Detailed plan preserved in `tasks/backlog--inline-categorization-indicator.md`.

### Documentation Audit

- Review and correct ADRs to ensure the decision is captured in each, and that each are still valid to the current state of the project.
- Update the readme to align with the current project. Include links to other documents as needed (such as releases.md)

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### Atomic Component Refactor

Outcome of the atomic-components review (separate presentation from
functionality; reduce mock-heavy tests). Ordered by leverage; each is an
independent task file. 1–3 deliver most of the testability/separation gains;
4–6 are reusability/readability cleanup.

1. Extract pure grouping + aisle-label formatting out of components — `tasks/backlog--extract-pure-grouping-and-aisle-format.md`.
2. Make `AppVersionPanel` a presentational molecule (move `usePwaUpdate` up) — `tasks/backlog--appversionpanel-presentational.md`.
3. Extract item-classification orchestration out of `AddItemForm` into a hook — `tasks/backlog--extract-useitemclassification.md`.
4. Shared `Modal` + `BottomSheet` primitives (dedup 4 overlays, centralize a11y) — `tasks/backlog--shared-modal-bottomsheet-primitives.md`.
5. `SelectionList` + `ItemEntryForm` shared molecules — `tasks/backlog--selectionlist-itementryform-molecules.md`.
6. Atomic component polish — `Button` type/variants, `Icon` atom, `GroceryListItem` split — `tasks/backlog--atomic-component-polish.md`.

### E2E Audit

- Implement E2E testing in pipeline (currently commented out due to failures).
- Audit existing E2E tests and harden test coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.

