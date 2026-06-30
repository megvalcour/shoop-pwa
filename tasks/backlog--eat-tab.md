---
status: backlog
class: epic
e2e_required: true
clarifications: |
  High-level, multi-phase outline only. Each phase is intentionally general and
  MUST be promoted to `tasks/active--*.md` and planned in full detail (with its
  own ADR review) before any implementation. Do not implement directly from this
  file.

  Driving goal: add a third main tab — "Eat" (alongside "Shop" and "Settings") —
  that lets the single user plan meals from persisted recipes and see the
  nutrition of that weekly plan scored against targets computed from their own
  age/sex/weight/height/activity.

  Decisions locked with the user before this outline (2026-06-29):
  - CORE MODEL: persisted recipes rolled into a weekly meal plan; the plan is
    what gets scored vs targets. (Not the raw shopping list.)
  - DATA SOURCE: USDA FoodData Central online, queried via a first-party
    Cloudflare Pages Function (extends the ADR-0019 proxy pattern), with every
    result cached in IndexedDB. A fresh, never-seen ingredient has no nutrition
    offline — degrade gracefully, surface "needs connection to enrich."
  - TARGETS: a local profile (age, sex, weight, height, activity) computes
    calorie + macro/micro targets on-device (Mifflin–St Jeor → TDEE, USDA DRI
    for micros). No PII leaves the device. Single user (per AGENTS.md).
  - THEMING: section-scoped green. Green applies while inside Eat routes (chrome
    included) and reverts to blue elsewhere. Reuses the existing token mechanism;
    no global toggle.
---

# "Eat" Tab — Meal Planning + Nutrition Against Personal Targets

## Goal

A third primary tab, **Eat**, that turns the recipes a user already imports into
a planned week of meals and shows how that week's nutrition stacks up against
targets derived from their own body/lifestyle. It reuses the existing recipe
import, ingredient normalization, the in-browser embedding model, and the
serverless-proxy pattern — adding persistence for recipes/plans, a nutrition
enrichment pipeline, a profile, and a scoped green sub-theme.

## What we leverage (recommendations to the user)

- **Recipe import (ADR-0019, `useRecipeImport`)** already returns
  `title + ingredients[] + sourceUrl`. Today those ingredients are dumped into a
  list and not persisted as a unit. Eat introduces a persisted `recipe` so an
  import can be *saved as a recipe* (with servings) and reused across weeks.
- **`normalizeIngredient`** already isolates the ingredient noun phrase from the
  quantity/unit — but it **discards the numeric value** (`NormalizedIngredient`
  keeps only `name` + `raw`; the leading-quantity regex recognizes the number
  purely to strip it). Nutrition needs the *value*, so the pipeline must extend
  parsing to **extract** quantity + unit, then convert to grams.
- **The in-browser embedding model (`Xenova/all-MiniLM-L6-v2`, ADR-0003)** is
  already loaded for aisle matching. Reuse the same model (no new download) to
  **rerank USDA FDC search candidates** for a given ingredient — FDC text search
  is noisy ("chicken" → hundreds of hits); embeddings pick the closest food.
  This is the "free in-browser model" angle: matching/disambiguation, not an LLM.
- **USDA FoodData Central** is the nutrition source. It needs an API key and a
  network call, which conflicts with the offline-first rule — so it goes behind a
  **first-party Cloudflare Pages Function** (`/api/nutrition`, holding the key
  server-side, same shape as `/api/import-recipe`), and every food's nutrient
  data is **cached in IndexedDB** so re-opening a planned recipe is offline.
- **Computed targets are pure local math** — Mifflin–St Jeor BMR × activity
  factor for energy, standard macro splits, USDA DRI tables for micros. No
  service, no key, trivially unit-testable.

## Phases

> Each phase below is a headline + intent only. Promote to `active--` and plan in
> full (files, ADRs, tests) before writing code.

### Phase 0 — Decision spikes & ADRs (de-risk before building)

- **ADR: Eat data model** — new object stores for `recipes`, `recipe_ingredients`,
  `meal_plan_entries`, plus a `nutrition_cache`; relationship to existing
  `items`/`list_items`. Bumps `DB_VERSION` → must ship as `feat:` (ADR-0017);
  confirm with user whether the migration is breaking.
- **ADR: nutrition data source** — a second Cloudflare Function for USDA FDC,
  explicitly bounded against the "no remote server" framing the way ADR-0019 is;
  caching strategy and offline degradation.
- **ADR: section-scoped theming** — how a green sub-theme coexists with ADR-0020's
  blue identity (note ADR-0008 was the original green, now superseded). Mechanism:
  a parallel green token ramp activated by a `data-theme="eat"` attribute on the
  app-shell root, keyed off the active route.
- **Spike: FDC match quality** — for ~30 real imported ingredients, measure how
  often plain FDC search vs embedding-reranked search lands the right food. This
  validates (or kills) the HF-rerank recommendation before committing to it.
- **Spike: quantity→grams** — feasibility of converting the unit vocabulary in
  `normalizeIngredient` (cups, tbsp, cloves, cans…) to grams using FDC portion
  data + a small density/weight table. Identifies which units are unconvertible
  and need a manual gram fallback.

### Phase 1 — Eat tab shell + scoped green theme

- Add the third `NAV_ITEM` and an `/eat` route (the nav is a trivial array in
  `AppShell`; structurally cheap).
- Implement section-scoped theming: green token ramp + `data-theme` switch on the
  shell, reverting to blue on leaving Eat. Verify nav/`StoreHeader` chrome
  retheme too, since they live outside the route `<Outlet>`.
- Ship an empty Eat landing screen (state-aware: no profile / no recipes / no
  plan) so theming and navigation can be reviewed before features land.

### Phase 2 — Profile & computed targets

- Profile capture screen (reuse existing atoms/molecules; persist via
  `preferences` or a small new store). Fields: age, sex, weight, height,
  activity level; units toggle.
- Pure `nutritionTargets` service: BMR (Mifflin–St Jeor) → TDEE → calorie +
  macro targets, plus DRI micro targets. Fully unit-tested, no I/O.
- Display the computed daily targets in Eat; recompute on profile edit.

### Phase 3 — Persisted recipes

- Persist a `recipe` (title, source_url, servings) + its `recipe_ingredients`
  (raw text, canonical name, **extracted quantity + unit**) — extend the import
  flow with a "Save as recipe" path; existing list-dump flow stays intact.
- Recipe library list + recipe detail UI inside Eat (reuse list/card molecules).
- Manual recipe entry/edit for recipes not imported from a URL.

### Phase 4 — Nutrition enrichment pipeline

- `/api/nutrition` Cloudflare Function proxying USDA FDC (key server-side, SSRF/
  rate-limit posture mirroring ADR-0019).
- Ingredient → FDC food matching: normalize, FDC search, **embedding rerank**
  (reuse the `useAisleMatcher` model-loader pattern), with a manual-pick
  fallback when confidence is low.
- Quantity + unit → grams conversion (from Phase 0 spike).
- `nutrition_cache` in IndexedDB keyed by FDC id; query→FDC mapping cached too.
  Graceful offline state when an ingredient is unenriched.
- Per-recipe nutrition rollup (per serving + total).

### Phase 5 — Weekly plan & scoring

- `meal_plan_entries`: assign recipes (with planned servings) to days of a week.
- Weekly + daily nutrition aggregation vs computed targets; visualization
  (rings/bars showing % of target, over/under) styled in the green sub-theme.
- Per-decision: a lightweight secondary "active shopping list" nutrition lens
  (the user chose recipes-primary; include only if it's cheap on top of the
  rollup engine).

### Phase 6 — Offline, polish, accessibility, E2E

- Verify offline behavior end-to-end (planned recipes with cached nutrition work
  with no network; clear "connect to enrich" states for misses).
- Empty/error/loading states across all Eat screens; WCAG contrast on the green
  ramp; reduced-motion for the scoring visualization.
- Playwright coverage: tab + theme switch, profile→targets, save recipe, enrich,
  build a week, scoring. (`e2e_required: true`; `validate` alone is not enough.)

## Open questions to resolve when promoting phases

- Recipe servings + per-serving vs whole-recipe nutrition: where the user sets
  "how many servings am I eating."
- How aggressively to pre-warm nutrition (enrich on save vs lazily on first view).
- Whether weekly plan is a fixed Mon–Sun grid or a rolling 7 days.
- DRI micro coverage: full panel vs a curated few (iron, calcium, fiber, sodium,
  vitamin C/D…) for v1.
