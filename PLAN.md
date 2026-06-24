## Current Status

ci: Adds E2E testing to the CI/CD pipeline.

## Active Task

### Recipe Import — Add to Grocery Lists from a Recipe

Register the PWA as a Web Share Target and add a manual import entry point.
A first-party Cloudflare Pages Function fetches the shared recipe URL, extracts
schema.org `Recipe` JSON-LD, and an import screen lets the user pick which
ingredients to add and which list to add them to.

- Plan: `tasks/active--recipe-import.md`
- New ADR-0019 required (first-party serverless fetch proxy).

## Backlog

### Reconcile Diverged ADR (0008)

One accepted ADR has drifted from the codebase. A new superseding ADR is needed (and a `Status: Superseded by ADR-NNNN` edit on the old one).

- **ADR-0008 (design tokens / visual identity)** — The token _mechanism_ (CSS custom properties in Tailwind v4 `@theme`) still holds, but the documented identity is wrong. Title says "warm jewel-tone"; current `src/index.css` uses blue `--color-primary: #084887` (ADR: green `#1B3A2D`), `--color-accent: #F58A07` (ADR: `#D4783A`), and `Nunito` for both display and body fonts (ADR: Playfair Display + DM Sans). New ADR should record the current palette/typography and supersede 0008's identity table.

Lower-priority stale _notes_ (no new ADR required; fix in place if/when touched): ADR-0005 references nonexistent `WeeklyListBuilder` (now `ShoppingListBuilder`); ADR-0011 references `oxford-62-aliases.json` (now `src/services/aisleAliases.ts`); ADR-0012's note "`useActiveStore` returns `stores[0]`, multi-store deferred" is superseded by ADR-0015 (Store Switcher now exists).

### Documentation Audit

- Update the readme to align with the current project. Include links to other documents as needed (such as releases.md)

### Grocery List Item Quantities

- Allow users to add/edit quantities on grocery list items (e.g., "2 lbs", "3 cans").
- Plan: `tasks/backlog--grocery-item-quantities.md`

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### E2E Audit

- Audit existing E2E tests and harden/expand coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.
