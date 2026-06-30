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
- **Eat Tab — Phase 4 (complete):** nutrition enrichment pipeline shipped. Added the
  second first-party Cloudflare Function (`/api/nutrition`, ADR-0027) proxying USDA
  FDC with the key server-side (single-host allowlist, token gate, no user-supplied
  destination URL); a pure `parseFdcFood` mapper; the Spike-2 `toGrams` ladder
  (mass → density → FDC `foodPortions` → manual-gram fallback); lazy, user-triggered
  enrichment (`useNutrition`) that caches each food in `nutrition_cache` and
  back-fills `recipe_ingredients.fdc_id`/`grams`; and a per-serving / whole-recipe
  rollup (keyed to the Phase 2 `nutritionTargets` micros) shown on recipe detail
  with per-row match status, manual re-pick, and an explicit "needs connection"
  offline state. **No `DB_VERSION` bump** — it only refined `NutritionCacheEntry.payload`
  from `unknown` to `FdcNutrientPanel` (a type-level change), so not a `feat(db)`
  migration. No `package.json` change; `.env.example` gained empty `FDC_API_KEY=` /
  `VITE_NUTRITION_TOKEN=` placeholders only. Resolved open questions: enrich is
  **lazy-on-first-view** (rate-limit-friendly); **no pre-warm** in v1; `nutrition_cache`
  has **no eviction** (`fetched_at` captured per ADR-0027); `item_id` linkage left for
  Phase 5. Embedding rerank ships as an internal, **non-blocking** refinement
  (mirrors `useAisleMatcher`: the model warms in a background worker and the first,
  cold enrich falls back to the FDC top hit immediately rather than blocking on the
  model load) — correctness rides on the top-hit + manual-pick fallback, so the
  absent live Spike-1 numbers (egress was blocked in Phase 0) don't gate the phase.
  Plan in `tasks/complete--eat-tab-phase-4.md`.
## Active

- **Eat Tab — Phase 5 (weekly plan & scoring) — PLANNED, not yet implemented:**
  full implementation plan in `tasks/active--eat-tab-phase-5.md`. Wires the one
  still-unused store (`meal_plan_entries`) to assign saved recipes — with planned
  servings — to a fixed Mon–Sun grid, then scores each day's planned nutrition
  against the Phase 2 daily targets (plus a weekly avg-per-day summary) using the
  Phase 4 per-serving rollups, visualized as green-themed % -of-target rings. No
  `DB_VERSION` bump (the v9 store already exists), no new network surface. Key
  decisions: rings chosen by the user; still-assumed-pending-confirmation are
  day-of-week grid, flat recipe-per-day (no meal slots), per-day-vs-daily-target
  scoring, and shopping-list lens deferred. ADR-0029 (weekly-plan model & scoring)
  to be drafted at wrap-up.

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
