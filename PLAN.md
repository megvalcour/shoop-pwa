## Active Task

None.

## Current Status

- feat: move General Store to bottom of store list and rename subtitle

## Backlog

### Reconcile Diverged ADR (0008)

One accepted ADR has drifted from the codebase. A new superseding ADR is needed (and a `Status: Superseded by ADR-NNNN` edit on the old one).

- **ADR-0008 (design tokens / visual identity)** — The token _mechanism_ (CSS custom properties in Tailwind v4 `@theme`) still holds, but the documented identity is wrong. Title says "warm jewel-tone"; current `src/index.css` uses blue `--color-primary: #084887` (ADR: green `#1B3A2D`), `--color-accent: #F58A07` (ADR: `#D4783A`), and `Nunito` for both display and body fonts (ADR: Playfair Display + DM Sans). New ADR should record the current palette/typography and supersede 0008's identity table.

Lower-priority stale _notes_ (no new ADR required; fix in place if/when touched): ADR-0005 references nonexistent `WeeklyListBuilder` (now `ShoppingListBuilder`); ADR-0011 references `oxford-62-aliases.json` (now `src/services/aisleAliases.ts`); ADR-0012's note "`useActiveStore` returns `stores[0]`, multi-store deferred" is superseded by ADR-0015 (Store Switcher now exists).

### Recipe Import Quantities

- Carry a recipe ingredient's parsed quantity/unit (e.g. "2 cups flour" → qty 2,
  unit "cups") into the added item. `normalizeIngredient` already parses these;
  `RecipeImporter` currently discards them. Requires extending the add mutations
  to accept an optional `{ quantity, unit }` and deciding merge semantics when the
  added item is also a duplicate. Follow-up to the Item Quantities task. Plan:
  `tasks/backlog--recipe-import-quantities.md`.

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### E2E Audit

- Audit existing E2E tests and harden/expand coverage.

### Fix Playwright/Chromium Browser Mismatch in Web Sessions

- In the Claude Code web execution environment, `npx playwright test` fails with
  `Executable doesn't exist at .../chromium_headless_shell-<N>/...`: the pinned
  `@playwright/test` version expects a newer browser build than the one
  pre-installed under `/opt/pw-browsers` (seen: tool wants build 1228, env has
  1194), and `npx playwright install` is disabled in this environment.
- Current workaround is a throwaway local config overriding
  `launchOptions.executablePath` to the installed binary
  (`/opt/pw-browsers/chromium-<N>/chrome-linux/chrome`) — not committed, manual
  each session.
- Goal: make `npm run test:e2e` work out-of-the-box in web sessions without a
  hand-rolled config. Options to evaluate: a SessionStart hook (see the
  `session-start-hook` skill) that resolves the installed Chromium and exports it
  for Playwright; reading `executablePath` from an env var in
  `playwright.config.ts` (defaulting to Playwright's own resolution locally/CI so
  it doesn't regress CI); or aligning the pinned `@playwright/test` version with
  the env's browser build. Confirm CI (which installs its own browsers) is
  unaffected by whatever approach is chosen.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.
