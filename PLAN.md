## Current Status

`feat(big-y): refresh Big Y aisle layout (15 numbered + Frozen) with v5 migration`

## Active Task

_None — pick the next item from the backlog._

## Backlog

### Reconcile Diverged ADRs (0008 & 0010)

Two accepted ADRs have drifted from the codebase. ADRs are immutable, so each needs a **new superseding ADR** (and a `Status: Superseded by ADR-NNNN` edit on the old one).

- **ADR-0008 (design tokens / visual identity)** — The token _mechanism_ (CSS custom properties in Tailwind v4 `@theme`) still holds, but the documented identity is wrong. Title says "warm jewel-tone"; current `src/index.css` uses blue `--color-primary: #084887` (ADR: green `#1B3A2D`), `--color-accent: #F58A07` (ADR: `#D4783A`), and `Nunito` for both display and body fonts (ADR: Playfair Display + DM Sans). New ADR should record the current palette/typography and supersede 0008's identity table.
- **ADR-0010 (Cloudflare Pages CI/CD)** — The Cloudflare Pages deploy decision still holds, but the stated pipeline is wrong. ADR claims three jobs `validate → e2e-tests → build-and-deploy`; actual `.github/workflows/deploy.yaml` is `validate → release → build-and-deploy` with **no `e2e-tests` job** and an added semantic-release `release` job. New ADR should document the real pipeline (E2E removed/deferred — see the "E2E Audit" backlog item — and semantic-release added per ADR-0017).

Lower-priority stale _notes_ (no new ADR required; fix in place if/when touched): ADR-0005 references nonexistent `WeeklyListBuilder` (now `ShoppingListBuilder`); ADR-0011 references `oxford-62-aliases.json` (now `src/services/aisleAliases.ts`); ADR-0012's note "`useActiveStore` returns `stores[0]`, multi-store deferred" is superseded by ADR-0015 (Store Switcher now exists).

### Documentation Audit

- Update the readme to align with the current project. Include links to other documents as needed (such as releases.md)

### Grocery List Item Quantities

- Allow users to add/edit quantities on grocery list items (e.g., "2 lbs", "3 cans").
- Plan: `tasks/backlog--grocery-item-quantities.md`

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### E2E Audit

- Implement E2E testing in pipeline (currently commented out due to failures).
- Audit existing E2E tests and harden test coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.
