## Current Status

- **Eat Tab — Phase 1 (complete):** shell + section-scoped green theme + empty
  landing shipped. Third primary **Eat** tab, `/eat` route, `data-theme="eat"`
  green sub-theme (ADR-0028), and a static "coming soon" landing. No schema/DB
  change. Plan in `tasks/complete--eat-tab-phase-1.md`. Phase 0 (decision
  spikes & ADRs 0026/0027/0028) complete: `tasks/complete--eat-tab-phase-0.md`.
- **Eat Tab — Phase 2 (complete):** profile capture + locally-computed nutrition
  targets shipped. Schema-free — the profile persists as a JSON value in the
  existing `preferences` store under `eat_profile` (no `DB_VERSION` bump;
  ADR-0026's stores stay reserved for Phase 3/4). Curated micronutrient panel
  (fiber/sodium/calcium/iron/potassium/vit C/vit D), imperial-default units with
  a metric toggle (metric-canonical storage), and a pure `nutritionTargets`
  service (Mifflin–St Jeor → TDEE → macros + DRI micros). `EatRoute` now shows an
  empty-state CTA or a summary + computed targets. Plan in
  `tasks/complete--eat-tab-phase-2.md`.
- **Eat Tab — Phase 3 (complete):** persisted recipes shipped. First Eat phase to
  bump the schema: `DB_VERSION` 8 → 9 creating ADR-0026's four stores (`recipes`,
  `recipe_ingredients`, `meal_plan_entries`, `nutrition_cache` — additive /
  non-breaking; existing data verified intact on upgrade), with only `recipes` +
  `recipe_ingredients` wired into hooks/UI. Adds a "Save as recipe" import
  destination, a recipe-scoped quantity/unit parser (`parseIngredientMeasure`,
  sharing the measure vocabulary via `measureTokens.ts` and leaving ADR-0021's
  `normalizeIngredient` untouched), `useRecipes` CRUD hooks (single-transaction
  cascade), and a recipe library/detail/manual-entry surface inside Eat under
  `/eat/recipes/*`. Confirmed decisions: all four stores created now; quantity/unit
  auto-parsed on the recipe path (ranges take the low value); reset does NOT wipe
  recipes. Plan in `tasks/complete--eat-tab-phase-3.md`.
- **Next:** Eat Tab Phase 4 (nutrition enrichment pipeline; ADR-0027,
  `/api/nutrition`) — ingredient→FDC matching, embedding rerank, quantity→grams,
  populating the `nutrition_cache` store created this phase.

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
