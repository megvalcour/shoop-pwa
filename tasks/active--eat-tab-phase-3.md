---
epic: eat-tab
phase: 3
status: active
class: standard
e2e_required: true
clarifications: |
  Phase 3 of the "Eat" tab epic (`tasks/backlog--eat-tab.md`). This is the
  PERSISTED RECIPES phase: turn an imported (or hand-entered) recipe into a
  durable, reusable `recipe` + its `recipe_ingredients`, and give the Eat tab a
  recipe library + detail + manual-entry surface. This is the phase ADR-0026
  reserved DB_VERSION 9 for, so it is the FIRST Eat phase that bumps the schema.

  No nutrition fetch, no weekly plan, no scoring — those stay Phases 4 & 5. The
  `nutrition_cache` and `meal_plan_entries` stores are CREATED in this migration
  (ADR-0026 commits all four stores to one append-only `oldVersion < 9` case) but
  are NOT wired into any hook or UI here; they sit empty until their phases land.

  Decisions to lock with the user before implementation (see "Open questions to
  confirm before coding" — do not start until these are answered):
  - MIGRATION SHAPE: create all four ADR-0026 stores in the single v9 case now
    (recommended — it is what the ADR designed), even though only `recipes` +
    `recipe_ingredients` get behaviour this phase. Avoids a second DB bump in
    Phase 4/5.
  - QUANTITY/UNIT CAPTURE: recover the recipe ingredient's quantity + unit via a
    NEW recipe-only pure parser (`parseIngredientMeasure`), leaving
    `normalizeIngredient`'s ADR-0021 noun-phrase behaviour untouched. The parser
    pre-fills the import preview's existing per-row quantity/unit controls only on
    the "Save as recipe" path; the shopping-list / default-list paths keep
    defaulting to ×1 exactly as today.
  - CATALOG LINK: Phase 3 stores `canonical_name` and leaves
    `recipe_ingredients.item_id` undefined (lazy catalog/FDC match is Phase 4).
  - SERVINGS: `recipes.servings` is captured at save (default 4, editable);
    per-serving vs whole-recipe nutrition math is Phase 4/5.
---

# Phase 3: "Eat" Tab — Persisted Recipes

## Relevant ADRs

- **ADR-0026** (Eat data model, *Accepted*) — THE governing ADR for this phase.
  It designed the four stores (`recipes`, `recipe_ingredients`,
  `meal_plan_entries`, `nutrition_cache`), the `oldVersion < 9` append-only
  migration, the index set, and the reuse decisions (`recipe_ingredients.item_id`
  soft-references `items`; `recipe_ingredients` carries the extracted
  `quantity`+`unit`). Phase 3 IMPLEMENTS this ADR's `recipes` +
  `recipe_ingredients` surface. Do not deviate from the documented store shapes
  without a superseding ADR. The migration is recorded there as **non-breaking /
  additive** (creates empty stores, alters/drops nothing).
- **ADR-0021** (recipe ingredient normalization, *Accepted*) — the binding
  constraint to RESPECT, not contradict. It deliberately removed quantity/unit
  *extraction* from `normalizeIngredient` (the leading measure run is discarded as
  noise). Phase 3 must NOT re-introduce extraction into `normalizeIngredient`.
  Instead it recovers quantity/unit for the recipe path via a SEPARATE pure util,
  exactly as ADR-0026's Notes anticipate ("the extraction itself is additive
  Phase 3 work and does not change the ADR-0021 noun-phrase behavior"). Surface
  this for review: confirm the reviewer agrees a recipe-scoped parser is additive
  to ADR-0021 and does not need a superseding record (it does not change
  `normalizeIngredient`).
- **ADR-0017** (decouple semver from DB_VERSION, *in force*) — a `DB_VERSION`
  bump MUST ship in a `feat:` commit; CI fails a bump with no `feat:` in the
  range. Phase 3 bumps 8 → 9, so the schema commit is `feat:`.
- **ADR-0004** (Zustand + TanStack Query split) — recipes are PERSISTENT data, so
  all recipe reads/writes go through TanStack Query hooks backed by IndexedDB
  (`hooks/useRecipes.ts`), never Zustand. The manual-entry form's unsaved draft is
  local component state, not a store (same posture as `EatProfileForm`).
- **ADR-0005** (atomic design) — recipe CRUD hooks are consumed by
  organisms/routes; the recipe card, the ingredient row, and the recipe form are
  molecules/organisms. Reuse existing atoms (`Button`, `Input`, `Spinner`) and the
  `SelectionList` / `BottomSheet` / `QuantitySheet` molecules before authoring new
  ones.
- **ADR-0028** (section-scoped green theme) — every new Phase 3 surface renders
  under `/eat`, so it inherits the green sub-theme via the `data-theme="eat"`
  cascade. Use role tokens only (`bg-card`, `text-text`, `text-text-muted`,
  `bg-primary`, `text-accent`, `shadow-card`); no hardcoded hexes.
- **ADR-0019** (serverless fetch proxy for recipe import) — unchanged. Phase 3
  reuses `useRecipeImport`/`/api/import-recipe` as-is; it only adds a new
  *destination* ("Save as recipe") for the already-fetched ingredients. No proxy
  or endpoint change. (The nutrition proxy is ADR-0027 / Phase 4.)
- **ADR-0009** (on-demand shopping list model) — left intact. Saving a recipe does
  NOT create a shopping list; the existing list-dump path is untouched. A recipe
  is a new, parallel relation, not a list.

## Goal

Let the single user save a recipe — imported from a URL or entered by hand — as a
durable unit (title, optional source URL, servings, and a list of ingredient lines
each carrying raw text, a canonical name, and an extracted quantity + unit), then
browse a recipe library and open a recipe's detail inside the Eat tab. This is the
persistence substrate the nutrition pipeline (Phase 4) and the weekly plan
(Phase 5) build on. No network beyond the existing import proxy; everything
persists locally and works offline once saved.

## Exit Criteria

- **Schema:** `DB_VERSION` 8 → 9; an append-only `if (oldVersion < 9)` case in
  `idbClient.ts` creates the four ADR-0026 stores with the documented indexes.
  `recipes` + `recipe_ingredients` interfaces (and their `ShoopDB` entries) land
  in `schema.ts`. `meal_plan_entries` + `nutrition_cache` interfaces + store
  entries also land (so the types match the created stores) but get no hook/UI.
  Migration verified non-breaking on an upgraded populated DB (existing data
  survives; new stores exist and are empty).
- **Save as recipe (import path):** the import preview (`RecipeImporter`) gains a
  "Save as recipe" destination alongside the existing list/default targets.
  Choosing it captures the recipe (title → recipe title; servings input) and its
  ingredients (each row's name → `canonical_name`, the row's quantity/unit →
  `recipe_ingredients`), then navigates to the new recipe detail. The
  list-dump and default-list paths are byte-for-byte unchanged.
- **Quantity/unit recovery:** a new pure `parseIngredientMeasure(raw)` →
  `{ quantity?: number; unit?: string }` pre-fills the per-row quantity/unit in the
  import preview ONLY when the destination is "Save as recipe". `normalizeIngredient`
  is unchanged (ADR-0021). Fully unit-tested, no I/O.
- **Manual recipe entry/edit:** a form (organism) to create or edit a recipe with
  no source URL — title, servings, and ingredient lines (each line normalized for
  `canonical_name` + parsed for quantity/unit on entry, all editable). Reuses
  `Input`/`Button` atoms and the field pattern from `EatProfileForm`.
- **Recipe library + detail (inside Eat):** the Recipes `ComingSoonSection` stub in
  `EatRoute` is replaced by a real, state-aware section — empty state ("No recipes
  yet" + Add CTA) or a list of saved recipes; tapping one opens a detail route
  showing title, servings, source link (if any), and the ingredient lines. Detail
  offers Edit and Delete (delete cascades `recipe_ingredients` by the `recipe_id`
  index, mirroring `useDeleteShoppingList`).
- **Hooks:** `hooks/useRecipes.ts` — `useRecipes()` (library), `useRecipe(id)`
  (detail with its ingredients), `useSaveRecipe()` (create from import or manual),
  `useUpdateRecipe()`, `useDeleteRecipe()` (cascade). Query keys + caching defined
  here only (ADR-0004); recipe + ingredient writes commit in one transaction.
- **Routing:** new `/eat/recipes/:id` (detail) and `/eat/recipes/new` +
  `/eat/recipes/:id/edit` (manual entry/edit) routes registered in `App.tsx` under
  the existing layout. The Eat landing's Recipes section links into them. All stay
  under `/eat` so the green theme applies.
- **Tests:** unit tests for `parseIngredientMeasure` (the highest-value new pure
  surface), the recipe hooks (create/read/update/delete + cascade round-trip
  against fake-indexeddb), the manual recipe form (validation + submit), and the
  Eat route's empty-vs-populated Recipes branch. `npm run validate` clean.
- **E2E:** import → Save as recipe → see it in the library → open detail; plus
  manual add → edit → delete. `npm run test:e2e` green (`e2e_required: true`).
- **Commit:** the `DB_VERSION` bump ships as `feat:` (ADR-0017). **No
  `package.json` change** (no new dependency — parser is hand-written, reuses
  existing atoms/molecules). If a dep seems needed, ask first (AGENTS.md).

---

## Data Shapes (TypeScript — added to `src/db/schema.ts`)

Mirror the ADR-0026 Notes exactly. All ids `crypto.randomUUID()`; `nutrition_cache`
is keyed by the external FDC id.

```ts
export interface Recipe {
  id: string;                 // PK, uuid
  title: string;
  source_url?: string;        // present when imported from a URL
  servings: number;           // yield; per-serving math (Phase 4/5) divides by this
  created_at: number;         // epoch ms
}

export interface RecipeIngredient {
  id: string;                 // PK, uuid
  recipe_id: string;          // Index → recipes.id
  raw: string;                // original ingredient line, preserved for display
  canonical_name: string;     // normalizeIngredient name, lower-cased for matching
  item_id?: string;           // Index → items.id when matched (Phase 4; undefined now)
  quantity: number;           // extracted value (parseIngredientMeasure; default 1)
  unit: string;               // extracted unit token ('' when none)
  grams?: number;             // resolved by Phase 4 enrichment (undefined now)
  fdc_id?: string;            // resolved FDC food (Phase 4; undefined now)
}

export interface MealPlanEntry {   // store created now, UNUSED until Phase 5
  id: string;                 // PK, uuid
  recipe_id: string;          // Index → recipes.id
  day: string;                // day-of-week or ISO date (Phase 5 decides)
  planned_servings: number;
}

export interface NutritionCacheEntry { // store created now, UNUSED until Phase 4
  fdc_id: string;             // PK, external (USDA FDC food id)
  payload: unknown;           // per-100g nutrient panel + foodPortions (Phase 4 types it)
  query: string;              // normalized ingredient query that resolved here
  fetched_at: number;         // epoch ms, future staleness policy
}
```

`ShoopDB` additions:

```ts
recipes: { key: string; value: Recipe; indexes: Record<never, never> };
recipe_ingredients: {
  key: string; value: RecipeIngredient;
  indexes: { recipe_id: string; item_id: string };
};
meal_plan_entries: {
  key: string; value: MealPlanEntry; indexes: { recipe_id: string };
};
nutrition_cache: { key: string; value: NutritionCacheEntry; indexes: Record<never, never> };
```

> **Why type the two unused stores now:** `idb`'s typed wrapper requires every
> created store to exist on `ShoopDB`. Creating the stores in the v9 case (per
> ADR-0026's one-migration design) without the type entries would force `as
> unknown` casts like the legacy `weekly_list` lines. Declaring all four keeps the
> migration fully typed and avoids a second `DB_VERSION` bump in Phase 4/5.

## Quantity/Unit Recovery (the new pure parser)

`src/utils/parseIngredientMeasure.ts` — **pure, network-free, no React, no `db/`.**
Separate from `normalizeIngredient` so ADR-0021's noun-phrase behaviour is
untouched (that util keeps discarding the measure run; this one reads it).

- Reuse the existing measure vocabulary by exporting `NUMBER_SRC`/`LEADING_QUANTITY`
  and the `UNITS` set from `normalizeIngredient.ts` (or lift the shared constants
  into a small `measureTokens.ts` both import) rather than duplicating the regex —
  DRY, and they must agree on what a unit is.
- `parseIngredientMeasure(raw)` runs the SAME measure-region normalization, then
  reads (rather than discards) the leading quantity and the unit token, returning
  `{ quantity?: number; unit?: string }`. A numeric value the regex recognizes is
  now *parsed* (fractions/mixed numbers → decimal: `"1 1/2"` → 1.5; vulgar
  fractions → decimal). No leading number → `quantity` undefined (caller defaults
  to 1). Unit token not in `UNITS` → `unit` undefined.
- Conversion of quantity+unit → **grams is explicitly Phase 4** (the enrichment
  pipeline, using FDC portion data + a density table — backlog Phase 0 spike). This
  phase only captures the raw quantity + unit token.

> Surface for review: this recovers the value ADR-0021 discarded, but ONLY for the
> recipe path and ONLY in a new util. If the reviewer prefers to keep recipe
> quantities user-entered (no auto-parse, every row defaults to ×1 like a shopping
> add), the parser becomes optional polish and the import-preview pre-fill is the
> only thing dropped — flag and confirm.

## Implementation Steps

### Part 1 — Schema + migration (the `feat:` core)

- [ ] **`src/db/schema.ts`** — add the four interfaces above + the four `ShoopDB`
  store entries with indexes; bump `DB_VERSION` 8 → 9.
- [ ] **`src/db/idbClient.ts`** — append an `if (oldVersion < 9)` case to `upgrade()`
  (never rewrite earlier cases). Create the four stores:
  - `recipes` (keyPath `id`).
  - `recipe_ingredients` (keyPath `id`) + `createIndex('recipe_id', …)` +
    `createIndex('item_id', …)`.
  - `meal_plan_entries` (keyPath `id`) + `createIndex('recipe_id', …)`.
  - `nutrition_cache` (keyPath `fdc_id`).
  No data backfill (all four start empty); the existing seed/reset paths are
  untouched (recipes are user data, not seeded). Confirm `resetUserData()` does
  NOT need to clear these for Phase 3 — recipes survive a "reset store data" by
  design unless the user explicitly says otherwise (open question to confirm).

### Part 2 — Recipe parser util

- [ ] **`src/utils/parseIngredientMeasure.ts`** (new, pure) — implement as above,
  sharing measure constants with `normalizeIngredient` (extract a shared module if
  cleaner). Export the parse fn.

### Part 3 — Recipe data hooks

- [ ] **`src/hooks/useRecipes.ts`** (new) — mirror `useShoppingLists.ts`:
  - `useRecipes()` → `useQuery(['recipes'])`, `getAll` sorted by `created_at` desc.
  - `useRecipe(id)` → `useQuery(['recipes', id])` returning
    `{ recipe, ingredients }` (ingredients via the `recipe_ingredients` `recipe_id`
    index). Disabled when `id` is undefined.
  - `useSaveRecipe()` → create a `Recipe` + its `RecipeIngredient[]` in ONE
    transaction (same idiom as `useCreateShoppingList`'s seeded path); input is
    `{ title, source_url?, servings, ingredients: Array<{ raw; name; quantity; unit }> }`.
    Invalidate `['recipes']`.
  - `useUpdateRecipe()` → replace the recipe row + its ingredients atomically
    (delete old ingredient rows via the index, add new); invalidate `['recipes']`
    + `['recipes', id]`.
  - `useDeleteRecipe()` → delete the recipe + cascade its `recipe_ingredients` by
    the `recipe_id` index in one transaction (mirror `useDeleteShoppingList`).

### Part 4 — Save-as-recipe from import

- [ ] **`src/components/molecules/ImportTargetPicker.tsx`** (edit) — add a third
  `ImportTarget` kind `{ kind: 'recipe' }` (the existing union is `new`/`existing`/
  `default`). Keep the existing options intact.
- [ ] **`src/components/organisms/RecipeImporter.tsx`** (edit) —
  - When `target.kind === 'recipe'`, on commit call `useSaveRecipe` with the
    checked rows (name + per-row quantity/unit + the fetched `title`/`sourceUrl`),
    then `navigate('/eat/recipes/:id')`. Add a small servings input shown only for
    the recipe target.
  - Pre-fill `quantities`/`units` from `parseIngredientMeasure(raw)` when the recipe
    target is selected (the list/default paths still default to ×1 — gate the
    pre-fill on the target kind so ADR-0021's shopping semantics are untouched).
  - The list-dump and default-list commit branches are unchanged.

### Part 5 — Manual entry/edit + recipe UI (organisms/molecules)

- [ ] **`src/components/molecules/RecipeCard.tsx`** (new) — presentational summary
  row for the library (title, servings, ingredient count, source badge). Role
  tokens only; no store access.
- [ ] **`src/components/molecules/RecipeIngredientRow.tsx`** (new) — one ingredient
  line for the detail/edit views (name, quantity+unit via `formatQuantity`, raw
  beneath when it differs — reuse the `RecipeImporter` label pattern).
- [ ] **`src/components/organisms/RecipeForm.tsx`** (new) — create/edit a recipe:
  title, servings (number, sane bounds), ingredient lines (add/remove rows; each
  row runs `normalizeIngredient` for the name + `parseIngredientMeasure` for
  quantity/unit, all editable). Reuse `Input`/`Button` and the `EatProfileForm`
  field pattern; validate (non-empty title, ≥1 ingredient, servings ≥ 1); disable
  save until valid. Seeds from `useRecipe(id)` in edit mode.
- [ ] **`src/components/organisms/RecipeLibrary.tsx`** (new) — reads `useRecipes`,
  renders the empty state or a `RecipeCard` list linking to detail; an "Add recipe"
  CTA → `/eat/recipes/new`.

### Part 6 — Routes + EatRoute wiring

- [ ] **`src/routes/RecipeDetailRoute.tsx`** (new) — `useRecipe(:id)`; renders title,
  servings, source link, `RecipeIngredientRow` list; Edit (`/eat/recipes/:id/edit`)
  + Delete (confirm → `useDeleteRecipe` → back to `/eat`). 404-ish empty state when
  the id is unknown.
- [ ] **`src/routes/RecipeFormRoute.tsx`** (new) — hosts `RecipeForm` for both
  `/eat/recipes/new` and `/eat/recipes/:id/edit` (id presence picks create vs edit).
- [ ] **`src/App.tsx`** (edit) — register `eat/recipes/new`, `eat/recipes/:id`,
  `eat/recipes/:id/edit` under the existing layout (the `/eat` prefix keeps the
  green theme). Order `new` before `:id` if React Router needs it.
- [ ] **`src/routes/EatRoute.tsx`** (edit) — replace the Recipes `ComingSoonSection`
  with `<RecipeLibrary />` (state-aware empty/populated). Leave the Weekly Plan
  stub (Phase 5) and the Profile section (Phase 2) untouched.

### Part 7 — Unit tests

- [ ] **`src/utils/__tests__/parseIngredientMeasure.test.ts`** — the core suite:
  integers, decimals, fractions (`1/2`→0.5), mixed (`1 1/2`→1.5), vulgar (`½`),
  ranges (take the low end or first value — document the choice), known units,
  unknown/absent units → undefined, dual-measure lines (first measure wins), and
  the no-quantity case. Pair every fixture with the matching `normalizeIngredient`
  assertion to prove the two stay consistent on the SAME inputs.
- [ ] **`src/hooks/__tests__/useRecipes.test.ts`** — create→read round-trip
  (recipe + ingredients), update replaces ingredients, delete cascades (no orphan
  `recipe_ingredients`), list ordering. fake-indexeddb at the repo's v9 schema.
- [ ] **`src/components/organisms/__tests__/RecipeForm.test.tsx`** — validation
  disables save; add/remove ingredient rows; submit writes the expected shape.
- [ ] **`src/routes/__tests__/EatRoute.test.tsx`** (extend) — Recipes empty state
  vs a populated library (mock `useRecipes`); keep the Profile + Weekly-Plan
  assertions.

### Part 8 — E2E

- [ ] **`e2e/eat-recipes.spec.ts`** (new) — from a clean IndexedDB: (a) import a
  recipe (reuse the existing import E2E fixture/mock for `/api/import-recipe`),
  choose "Save as recipe", assert it appears in the Eat library and the detail
  opens; (b) manual add → assert in library → edit (change title) → assert →
  delete → assert gone; (c) reload mid-way to prove persistence. Reuse the existing
  IndexedDB-reset/import helpers; do not fork new harness. Light green-theme
  assertion only (Phase 1 covers the switch).

### Part 9 — Migration safety check

- [ ] Manually verify (or add a test) that a DB populated at v8 upgrades to v9 with
  existing stores/lists/items intact and the four new stores present + empty. This
  is the load-bearing risk of the phase (a botched migration corrupts real data).

### Part 10 — Validate, document, ship

- [ ] `npm run validate` clean; `npm run test:e2e` green.
- [ ] Confirm the diff bumps `DB_VERSION` exactly once (8→9), the migration is
  append-only, and there is **no `package.json` change**.
- [ ] **`PLAN.md`** — move Current Status to Phase 3 (active) referencing this file;
  set "Next" to Phase 4 (nutrition enrichment pipeline). On completion, rename this
  file to `tasks/complete--eat-tab-phase-3.md` and resolve the relevant
  backlog open-questions (servings location: captured on the recipe; quantity/unit:
  recovered via the recipe-scoped parser).
- [ ] Commit with Conventional Commits. The `DB_VERSION` bump makes this a **`feat:`**
  (ADR-0017 gate), e.g. `feat: persist recipes and add the Eat recipe library`.
  Confirm with the user the migration is **non-breaking** before committing
  (AGENTS.md requires confirming breaking-ness on any `DB_VERSION` bump — ADR-0026
  already records it as additive/non-breaking, so this is a confirmation, not a
  re-decision). Push to `claude/eat-tab-next-phase-flgjuj`.

---

## What Phase 3 explicitly does NOT do

- **No nutrition fetch / no `/api/nutrition`** — ingredient→FDC matching, the
  embedding rerank, and quantity→grams conversion are Phase 4 (ADR-0027). Phase 3
  creates the empty `nutrition_cache` store but writes nothing to it.
- **No weekly plan / no scoring** — the `meal_plan_entries` store is created but
  unused; the Weekly Plan stub in `EatRoute` stays "coming soon" (Phase 5).
- **No catalog/aisle matching of recipe ingredients** — `recipe_ingredients.item_id`
  is left undefined (lazy match is Phase 4). Saving a recipe does NOT add items to
  the `items` catalog or place them in aisles.
- **No change to `normalizeIngredient`** — ADR-0021's noun-phrase behaviour is
  untouched; quantity/unit recovery lives in a new, separate util.
- **No change to the shopping-list / default-list import paths** — "Save as recipe"
  is a new third destination; the existing flows are byte-for-byte intact.
- **No new dependency** — parser is hand-written; existing atoms/molecules suffice.
- **No new ADR** — ADR-0026 already governs the data model and ADR-0028 the theme.
  Surface for review: confirm the recipe-scoped quantity parser is read as additive
  to ADR-0021 (not a contradiction) and the migration matches ADR-0026's design.

## Risks / things to watch

- **Migration correctness is the load-bearing risk.** A wrong `oldVersion` guard,
  a missing index, or rewriting an earlier case corrupts real user data on upgrade.
  Keep the v9 case strictly append-only and additive; verify an upgraded populated
  DB end-to-end (Part 9). This is the #1 review surface.
- **ADR-0021 regression.** The shopping/default import paths must keep defaulting to
  ×1 — the `parseIngredientMeasure` pre-fill must be gated on the recipe target
  only. A test that asserts `normalizeIngredient` is unchanged AND that the
  shopping path still defaults ×1 is the guardrail.
- **Cascade integrity.** Deleting/updating a recipe must not orphan
  `recipe_ingredients` — do it in one transaction via the `recipe_id` index (test
  the no-orphan invariant).
- **Theme inheritance.** New recipe surfaces under `/eat` must use role tokens only;
  one hardcoded hex breaks the green retheme (ADR-0028).
- **Scope creep into Phase 4/5.** It is tempting to "just match the ingredient to a
  catalog item / fetch its nutrition while we're here." Resist — those are Phase 4.
  Phase 3 stops at durable persistence + browse/edit.
- **`resetUserData` semantics.** Decide whether the Settings "reset" wipes recipes
  (open question). Default recommendation: leave recipes alone (they are user
  content, like a saved document), and confirm with the user.

## Open questions to confirm before coding

- **Migration shape** — create all four ADR-0026 stores in the v9 case now
  (recommended), or only `recipes` + `recipe_ingredients` and bump again later?
  Recommend all four (matches the ADR's one-migration design; avoids a second bump).
- **Quantity/unit capture** — auto-parse via the new recipe-scoped
  `parseIngredientMeasure` (recommended), or keep recipe quantities user-entered
  (every row ×1, no parser)?
- **Range handling in the parser** — `"1 to 2 cups"`: take the low value, the high,
  or the midpoint? Recommend the low/first value (matches the conservative posture).
- **`resetUserData`** — should the Settings data-reset clear recipes? Recommend NO
  (recipes are durable user content); confirm.
- **Recipe entry points** — is "Save as recipe" from import + manual add inside Eat
  enough for v1, or is a top-level "import → save as recipe" entry also wanted? The
  plan ships both import-destination and Eat manual-add; confirm that covers it.
