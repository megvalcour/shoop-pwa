## Current Status

- feat: friendlier ingredient weight sizing in Eat nutrition — count/container units
  now resolve to labeled estimates, a household-portion picker replaces the bare
  grams prompt, and resolved weights are remembered per ingredient. ADR for the
  labeled-estimate + override posture is deferred pending the ADR granularity audit.

## Active

- _(none)_

## Backlog

### ADR Granularity Audit

- Audit the current ADRs (`docs/adrs/`) for excessive granularity: several decisions
  may be finer-grained than warranted (e.g. per-phase Eat decisions, closely-related
  visual/identity records). Identify candidates to consolidate or retire and propose a
  right-sized structure, keeping the immutability rules (supersede, never edit).
  One-liner in `tasks/backlog--adr-granularity-audit.md`.

### "Eat" Tab (Meal Planning + Nutrition)

- Add a third main tab — **Eat** — that turns persisted recipes into a weekly meal
  plan scored against targets computed locally from the user's age/sex/weight/
  height/activity. Nutrition data from USDA FoodData Central via a first-party
  Cloudflare Function (extends ADR-0019) cached in IndexedDB; ingredient→food
  matching reuses the in-browser embedding model; entering Eat applies a
  section-scoped green sub-theme. Multi-phase outline in `tasks/backlog--eat-tab.md`;
  each phase to be promoted to `active--` and fully planned (with ADR review)
  before implementation.

### iOS App (Capacitor Shared-Pipeline Wrapper)

- Wrap Shoop as an installable iOS app via a thin Capacitor shell over the same web
  codebase (one repo → one `dist/` → `cap sync`), primarily to close the iOS
  `share_target` gap with a native Share Extension funneling into the existing
  `/import` flow. Multi-phase outline in `tasks/backlog--ios-capacitor-app.md`;
  each phase to be promoted to `active--` and fully planned (with ADR review)
  before implementation. Step 0 has plan as well: `backlog--ios-phase0-decision-spikes.md`.

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### E2E Audit

- Audit existing E2E tests and harden/expand coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.
