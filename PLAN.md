## Current Status

- **Eat Tab — Phase 1 (active):** shell + section-scoped green theme + empty
  landing — adds the third primary tab, the `/eat` route, the `[data-theme='eat']`
  green sub-theme (ADR-0028), and a stubbed Eat landing screen. No schema/DB code.
  Full plan in `tasks/active--eat-tab-phase-1.md`. (Phase 0 — decision spikes &
  ADRs 0026/0028 — complete: `tasks/complete--eat-tab-phase-0.md`.)

## Backlog

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
