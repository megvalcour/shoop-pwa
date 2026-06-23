---
step: 6
substep: 8
status: validating
class: standard
e2e_required: true
clarifications: |
  Plan already reviewed and approved in backlog file. Proceeding directly to implementation.
---

# Task: Atomic component polish — Button, Badge, Icon, GroceryListItem

## Relevant ADRs

- **ADR-0005 (atomic design):** atoms have no business logic; the `Icon` atom and the cleaner `Button` axes reinforce that.
- **ADR-0007 (Font Awesome Free for icons):** the `Icon` atom is the single place that depends on `@fortawesome/*`.
- **ADR-0008 (design tokens):** any `Button` variant reshuffle reuses existing token classes; no new colors.

## Implementation Checklist

- [x] `Button` defaults to `type="button"`; verify the two `type="submit"` Add buttons unaffected.
- [x] Reshape `Button` variant/shape axes; sweep all call sites; existing button tests green.
- [x] Create `Icon` atom; migrate `FontAwesomeIcon` usages in touched files.
- [x] Create `ListItemRow` presentational molecule (no sheet state, badge slot).
- [x] Refactor `GroceryListItem` to wrap `ListItemRow`; manage `sheetOpen` + badge composition.
- [x] Switch `DefaultListEditor` to use `ListItemRow` directly.
- [x] Unit tests: extend `Button.test.tsx`; add `ListItemRow.test.tsx`.
- [x] `npm run validate` clean.

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Validation passed (typecheck clean, lint clean, 292/292 tests green). E2E required before final sign-off.
