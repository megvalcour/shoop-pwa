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

### E2E Audit

- Implement E2E testing in pipeline (currently commented out due to failures).
- Audit existing E2E tests and harden test coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.

