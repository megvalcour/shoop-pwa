## Active Task

- None. Pick up the next backlog item when directed.

## Current Status

- feat: add a custom store from an AI-generated JSON file (ADR-0024) — new
  `/stores/new` page (reachable from Settings beneath the store list) with a
  "Copy prompt" button, file-upload + paste both feeding one pure
  `parseStoreImport` validator, a preview, and `useImportStore` which mints all
  ids/a unique slug and writes the store + aisles + per-store `item_locations`
  (riding ADR-0015) in one transaction. Items stay in the shared catalog;
  representative items per aisle seed the matcher so real items bucket from day
  one. No `DB_VERSION` bump (purely additive, IndexedDB-only); wiped by "Reset
  all data" as documented.
- feat: recipe-import preview swaps the free-text unit input for the shared
  `×N` quantity chip + `QuantitySheet` (stepper ≥1 plus optional unit, now
  datalist-backed via a new `unitSuggestions` prop). Each row still defaults to
  ×1/no-unit (ADR-0021); the chosen quantity/unit is carried into the committed
  list/default-list item. `useAddListItem`/`useAddDefaultListItem` accept an
  optional `quantity` and dedup on `(item_id, unit)` — same-unit re-adds sum,
  differing-unit adds split into a second row over one shared catalog item.
- refactor: replace the `bg-primary` aisle number placard with inline
  `Aisle N — Label` headers (it read like a count) — `AisleGroup` drops the
  `marker` prop/placard branch and `ShoppingListBuilder` passes
  `formatAisleLabel(aisle)` for every bucket (ADR-0023, supersedes ADR-0022's
  signature section only).
- fix: reveal the swipe-delete affordance only while swiping — `SwipeableRow`'s
  destructive layer is now a full-bleed `bg-destructive` layer gated to
  `opacity-100` only while the row is open (swipe in progress or fallback button
  focused), with unconditional corner clipping so no red shows at rest.
- docs: add ADR-0023 (inline aisle headers + swipe-reveal refinement),
  superseding ADR-0022's signature section only; ADR-0022's swipe-to-delete
  decision and ADR-0020's tokens remain in force.
- refactor: replace the aisle spine with calm aisle-placard headers and
  de-emphasize the per-row aisle-swap badge — `AisleGroup` drops the vertical
  rail + 26px numbered node (and the `pl-9` indent) for a single filled
  `bg-primary` placard tile carrying the aisle number in the sticky header;
  `ShoppingListBuilder` passes the bare aisle name for numbered aisles so the
  redundant "Aisle N —" prefix is gone (`formatAisleLabel` untouched for pickers
  and non-numeric sections).
- feat: swipe-to-delete shopping list rows — new hand-rolled `SwipeableRow`
  molecule (Pointer Events, axis-locked, tap-vs-drag suppression, no new
  dependency) reveals a `bg-destructive` delete affordance; the persistent red
  trash button is removed from the in-motion list (kept in `DefaultListEditor`
  via `ListItemRow`'s unchanged optional button path). The revealed delete is a
  real focusable `<button>` for keyboard/screen-reader users.
- docs: add ADR-0022 (aisle-placard signature) superseding ADR-0020's signature
  section only — palette/typography/elevation remain in force; documents the
  placard signature and swipe-to-delete interaction. Cites ADR-0005.
- feat: drop quantity/unit extraction from recipe import (ADR-0021) —
  `normalizeIngredient` now returns a clean name only, greedily discarding the whole
  leading measure run (slash/glued/"or" dual measures collapse into one path before
  unit lookup, deleting the dual-measure mis-parse class). Imported items land at the
  default ×1 like any manual add, and the import preview gains an optional per-row
  unit control. Accepts ADR-0021.
- docs: propose ADR-0021 on recipe ingredient normalization approach — weighs the
  current regex pipeline (which mis-parses no-space dual measures like
  "2 cups/70 grams chocolate chips") against a tokenize-once parser, a parser
  library, in-browser AI extraction, server-side parsing, editable preview rows,
  and dropping quantity/unit extraction entirely; recommends dropping extraction:
  clean name only, default to ×1, user sets units in the preview.
- fix: strip slash-delimited alternate measurements in recipe import so a
  US + metric dual amount ("1 cup / 180 grams flour") imports as the bare noun
  ("Flour") with the first measure kept as quantity/unit
- feat: adopt monochrome-blue Material visual identity with aisle-spine signature (ADR-0020, supersedes ADR-0008)

## Backlog

### iOS App (Capacitor Shared-Pipeline Wrapper)

- Wrap Shoop as an installable iOS app via a thin Capacitor shell over the same web
  codebase (one repo → one `dist/` → `cap sync`), primarily to close the iOS
  `share_target` gap with a native Share Extension funneling into the existing
  `/import` flow. Multi-phase outline in `tasks/backlog--ios-capacitor-app.md`;
  each phase to be promoted to `active--` and fully planned (with ADR review)
  before implementation.

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
