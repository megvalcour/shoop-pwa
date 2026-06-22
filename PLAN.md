## Current Status

`feat(db): align initial semver minor with DB_VERSION 4 — adopt semantic-release for automated semver from conventional commits and enforce minor(appVersion) === DB_VERSION in CI (ADR-0016)`

## Active Task

_None. Promote a backlog item to active to begin the next task._

## Backlog

### Default List

- Users can create a store-agnostic default list in Settings; new list action includes option to start from scratch or from default list as base.

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
