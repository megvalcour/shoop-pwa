---
step: 5
substep: 3
status: plan_review
class: standard
e2e_required: true
clarifications: |
  The Step 3 clarification prompt (AskUserQuestion) failed to deliver (tool stream
  closed). To avoid stalling, the plan proceeds on the RECOMMENDED option for each
  open decision; every one is called out below as an assumption the user can
  override before Step 5 sign-off / implementation:
  - WEEK MODEL: fixed Mon–Sun grid. `meal_plan_entries.day` holds a day-of-week
    key ('mon'…'sun'). One implicit "this week" plan; no dates, no week picker.
  - DAY COMPOSITION: a flat list of recipes per day (each with planned servings).
    No breakfast/lunch/dinner meal slots in v1 (would add a `slot` field + UI).
  - SCORING UNIT: score each day's planned recipes against the Phase 2 DAILY
    targets, plus a weekly summary computed as average-per-day (week total ÷ 7)
    vs the same daily targets ("a typical day this week").
  - VISUALIZATION: % -of-target rings (energy + macros + micros) with
    under/on/over coloring via role tokens, honoring reduced-motion. Each ring
    pairs with a text value/target + percent label (and aria-label) so the score
    is legible without relying on the radial fill alone. (User chose rings over
    bars, 2026-06-30.)
  - SHOPPING-LIST NUTRITION LENS: OUT OF SCOPE for v1 (the backlog's optional
    secondary lens). Deferred — revisit only if cheap on a later pass.
  - NO DB_VERSION BUMP: `meal_plan_entries` already exists (created empty by the
    v9 migration) with the exact shape this phase needs. Phase 5 writes to it but
    changes NO store shape, so `DB_VERSION` stays 9 and this is NOT a `feat(db)`
    migration. (Surfaced for confirmation.)
---

# Phase 5: "Eat" Tab — Weekly Plan & Scoring

## Relevant ADRs

- **ADR-0026** (Eat data model, *Accepted*) — THE store this phase finally
  exercises. `meal_plan_entries { id, recipe_id (Index), day, planned_servings }`
  was created empty by the v9 migration and is the one Eat store still unwired.
  ADR-0026 explicitly deferred the `day` format ("day-of-week or ISO date —
  grid-vs-rolling: Phase 5") to this phase. Phase 5 fixes it to a **day-of-week
  key** (fixed Mon–Sun grid). NO store shape change → **no `DB_VERSION` bump**
  (the store already exists; this is not a migration).
- **ADR-0004** (Zustand + TanStack Query split) — the meal plan is PERSISTENT
  (IndexedDB), so all reads/writes go through a new TanStack Query hook
  (`hooks/useMealPlan.ts`) with keys/caching defined there only. Ephemeral plan
  UI state (which day's "add recipe" sheet is open, day-vs-week view toggle,
  expanded day) is NOT persisted — component state or a tiny `useUIStore` slice.
- **ADR-0005** (atomic design) — the score ring is an atom/molecule reading pure
  props; the per-day column is a molecule; the weekly plan is an organism owning
  the hooks. Reuse existing atoms (`Button`, `Badge`, `Spinner`) and the
  `BottomSheet`/`SelectionList`/`QuantitySheet` molecules for the add-recipe and
  servings affordances before authoring new ones.
- **ADR-0028** (section-scoped green theme) — every Phase 5 surface renders under
  `/eat`, inheriting the green sub-theme. Role tokens only; no hardcoded hexes.
  The scoring visualization MUST honor reduced-motion (`motion-safe:`), the
  constraint ADR-0028 flagged for "the Phase 5 scoring visualization." Rings need
  it especially: the radial fill must not animate under
  `prefers-reduced-motion`, and color alone must not carry the under/on/over
  meaning (pair every ring with a text percent + value/target and an aria-label).
- **ADR-0001/0002** (single-repo / IndexedDB offline-first) — the plan and its
  scoring compute ENTIRELY from already-persisted data (`meal_plan_entries` +
  `recipes`/`recipe_ingredients`/`nutrition_cache`), so building and viewing a
  scored week works fully offline. The only networked step is Phase 4 enrichment,
  reused unchanged; an unenriched planned recipe degrades to a partial score with
  an "enrich to score" affordance, never a throw.
- **ADR-0011** (layered aisle matching) / **ADR-0027** (nutrition source) —
  untouched. Phase 5 consumes the Phase 4 rollup output; it adds no new matching,
  no new network surface, no new `/api/*` function.

## Goal

Turn enriched recipes into a planned week and score it. The user assigns saved
recipes (with planned servings) to the seven days of a fixed Mon–Sun grid; each
day's planned nutrition is summed from the Phase 4 per-serving rollups and scored
against the Phase 2 daily targets, with a weekly average-per-day summary. The
scoring is shown as green-themed % -of-target rings (energy + the three macros +
the curated micro panel) with over/under indication. Everything reads from
persisted data, so the scored week works offline; recipes not yet enriched show a
partial score and an enrich affordance. The `meal_plan_entries` store is wired
for the first time. No new schema, no new network surface.

## Key reuse (do NOT rebuild)

- **`services/nutritionTargets.ts`** (Phase 2) — `computeTargets(profile)` →
  `NutritionTargets` (energyKcal, protein/fat/carbs `.grams`, `micros[]` keyed
  `fiber|sodium|calcium|iron|potassium|vitaminC|vitaminD`). The scoring DENOMINATOR.
- **`services/nutritionRollup.ts`** (Phase 4) — `NutrientTotals` (flat: energy +
  3 macros + same 7 micros) and `computeNutritionRollup`. A planned recipe's
  per-serving contribution is its `rollup.perServing`. The keys already match the
  targets by design ("Phase 5 scores by key match, no mapping table").
- **`hooks/useNutrition.ts` → `useRecipeNutrition`** (Phase 4) — the offline read
  that joins a recipe's ingredients to `nutrition_cache` and returns
  `rollup.perServing` + `enrichedCount`/`totalCount`/`unresolved`. Phase 5 needs
  the SAME join across MANY recipes at once → a new `useMealPlanNutrition` hook
  reuses `computeNutritionRollup` rather than calling `useRecipeNutrition` N times
  (dynamic hook count would break the rules of hooks).
- **`hooks/useRecipes.ts`** — recipe titles/servings for the add-recipe picker and
  the per-day recipe rows. `useDeleteRecipe` is EXTENDED here (cascade, below).
- **`components/molecules/TargetReadout.tsx` / `organisms/DailyTargets.tsx`** —
  the existing readout layout the new `ScorePanel` visually mirrors.
- **`BottomSheet` + `SelectionList`** — the add-recipe-to-day picker, same pattern
  as `FoodPickerSheet` (Phase 4) and the import target picker.

## Exit Criteria

- **Meal-plan data layer:** `src/hooks/useMealPlan.ts` — TanStack Query hooks over
  `meal_plan_entries`: read all entries for the week (grouped by day), add an entry
  (`recipe_id` + `day` + `planned_servings`), update an entry's `planned_servings`,
  remove an entry, and clear the week. Query key `['meal-plan']`; invalidated on
  every mutation. All offline-safe (pure IndexedDB). No store-shape change.
- **Orphan cascade:** `useDeleteRecipe` (in `useRecipes.ts`) EXTENDED to also delete
  the recipe's `meal_plan_entries` (via the `recipe_id` index) in the SAME
  transaction, so deleting a recipe can never leave a plan entry pointing at a
  ghost. The plan READ also defensively skips entries whose recipe no longer
  exists (belt-and-suspenders).
- **Pure scoring service:** `src/services/mealPlanScore.ts` — pure, no I/O:
  - `flattenTargets(NutritionTargets): NutrientTotals`-shaped target map (adapts
    the targets' `protein.grams`/`micros[]` shape into the flat `NutrientTotals`
    key space so target and actual share one key set).
  - `sumDayTotals(entries, perServingByRecipeId): NutrientTotals` — a day's planned
    nutrition = Σ over its entries of `perServing × planned_servings`.
  - `scoreTotals(actual: NutrientTotals, target): NutrientScore[]` — per nutrient
    `{ key, label, unit, value, target, pct, status: 'under'|'on'|'over' }`
    (`on` = within a documented band, e.g. 90–110%; sodium/energy "over" flagged
    distinctly from a micro shortfall — document the per-nutrient direction).
  - `weeklyAveragePerDay(dayTotals[]): NutrientTotals` — week total ÷ 7
    ("typical day"). Fully unit-tested incl. the empty-week and partial cases.
- **Meal-plan nutrition hook:** `src/hooks/useMealPlanNutrition.ts` — reads the
  plan + every referenced recipe's persisted nutrition in ONE query, builds a
  `perServingByRecipeId` map (via `computeNutritionRollup`), and returns per-day
  `NutrientScore[]` + the weekly summary + per-recipe enrichment status
  (enriched / partial / unenriched, from `enrichedCount`/`totalCount`). Offline by
  construction. Keys/caching here only (ADR-0004).
- **Score ring (atom/molecule):** `src/components/molecules/NutrientRing.tsx` —
  presentational single radial gauge: an SVG ring whose arc length encodes
  % -of-target (clamped for display; the true percent shown as text), plus label,
  `value / target` text, the percent, under/on/over color via role tokens, and an
  `aria-label` ("Protein: 82 of 120 g, 68% of target"). The arc-fill transition is
  `motion-safe:` only (no animation under `prefers-reduced-motion`). Color never
  the sole signal — the text percent + status carry the meaning too. Pure props.
- **Score panel (molecule):** `src/components/molecules/ScorePanel.tsx` — lays out
  `NutrientRing`s for energy + macros + micros in a responsive grid (mirrors
  `DailyTargets`' sectioning). Used for both a day and the weekly summary. Pure
  props; rounding at the display edge.
- **Day column (molecule):** `src/components/molecules/DayColumn.tsx` — one day of
  the grid: the day label, its planned recipes (title + servings stepper + remove),
  an "add recipe" affordance, and a compact day score (or a "no recipes" empty
  state). No store access — callbacks up to the organism.
- **Add-recipe picker (molecule):** `src/components/molecules/AddToPlanSheet.tsx` —
  `BottomSheet` + `SelectionList` of saved recipes (+ a planned-servings input,
  default = recipe.servings) to add to a chosen day. Reuses existing molecules;
  empty state when no recipes exist (CTA to the recipe library).
- **Weekly plan organism:** `src/components/organisms/WeeklyPlan.tsx` — owns
  `useMealPlan` + `useMealPlanNutrition`; renders the 7-day grid of `DayColumn`s,
  the day-vs-week scoring view (toggle or both), the add/remove/servings mutations,
  the no-profile state (targets need a profile → CTA, reuse the EatRoute pattern),
  and the unenriched-recipe affordance ("enrich to score" linking to recipe detail).
- **EatRoute wiring:** `src/routes/EatRoute.tsx` — replace the "Weekly Plan —
  coming soon" `ComingSoonSection` with `<WeeklyPlan />`. Green theme inherited;
  no other section changed.
- **Offline degradation:** with no network, the plan builds and scores from cached
  data; a planned recipe with unenriched ingredients contributes its partial total
  and is flagged, never throwing. Verified offline (manual + E2E assertion).
- **Tests:** unit for `mealPlanScore` (flatten, per-nutrient pct/status incl.
  over/under and the `on` band, weekly avg, empty/partial), `useMealPlan`
  (fake-indexeddb CRUD + cascade-on-recipe-delete), `useMealPlanNutrition` (multi-
  recipe join, unenriched → partial, orphan entry skipped),
  `NutrientRing` (arc geometry for 0%/partial/100%/over; reduced-motion class
  present; aria-label text), `ScorePanel`/`DayColumn`/`WeeklyPlan` component tests,
  and an extended `EatRoute` test. `npm run validate` clean.
- **E2E:** `e2e/eat-weekly-plan.spec.ts` — save + enrich a recipe (mock
  `/api/nutrition`, as the Phase 4 E2E does) → add it to a day with planned
  servings → day score rings appear → weekly summary reflects it; change servings /
  remove → score updates; reload with network off → plan + score persist. Reuse
  the existing IDB-reset/import helpers. `npm run test:e2e` green (`e2e_required`).
- **Commit:** Conventional Commits — `feat: add Eat weekly meal plan with target
  scoring`. **NOT a migration** (no `DB_VERSION` bump — confirm). **No
  `package.json` change** expected; ASK first if a dep seems needed (AGENTS.md).
  No `.env` change (no new network surface). Push to
  `claude/eat-tab-phase-5-plan-vm665c`.

---

## Data & contract decisions (ADR-worthy — drafted at wrap-up)

These are the future-constraining decisions this phase settles; an ADR-0029 (Eat
weekly-plan model & scoring) is drafted at Step 11:

1. **`meal_plan_entries.day` = day-of-week key** (`'mon'…'sun'`), one implicit
   current-week plan. Rejected: ISO-date rolling window and multi-week dated plans
   (heavier; unjustified for a single user in v1). A future "dated weeks" feature
   would be a new ADR superseding the `day` semantics, not an edit here.
2. **One entry = one recipe placed on one day** with `planned_servings`; the same
   recipe may appear on multiple days (two entries) or twice on one day. No meal
   slot. A `slot` field is a future additive change if breakfast/lunch/dinner is
   wanted.
3. **Scoring is per-day vs the DAILY targets**, weekly summary = week total ÷ 7.
   The rollup/target key sets already align (locked in Phase 4) so the join is a
   key match. The `on`/`under`/`over` band thresholds live in `mealPlanScore.ts`
   as documented constants (swappable, like the Phase 2 macro split).
4. **Reset:** `resetUserData` continues NOT to wipe Eat stores (Phase 3 decision —
   recipes survive reset), so the meal plan survives reset too; consistency is
   preserved by the orphan cascade on recipe delete, not by reset.

## Implementation Steps

### Part 0 — Shared constants + join helper (review-added)
- [ ] `src/services/mealPlanDays.ts` (or a `const` in `mealPlanScore.ts`) — the
  ordered `DAYS` key set (`['mon'…'sun']`) + display labels; the single source of
  truth for grid order and the `meal_plan_entries.day` contract.
- [ ] Extract the ingredients→`nutrition_cache` join out of `useRecipeNutrition`
  into a shared read helper (e.g. `readRecipeRollupInput(db, recipeId)` →
  `RollupIngredient[]`) so `useRecipeNutrition` AND `useMealPlanNutrition` build
  per-serving totals from ONE code path (no drift between a recipe's detail score
  and its plan score). Re-point `useRecipeNutrition` at the helper (behavior-
  preserving; its existing test must stay green).

### Part 1 — Pure scoring service
- [ ] `src/services/mealPlanScore.ts` — `flattenTargets`, `sumDayTotals`,
  `scoreTotals` (per-nutrient pct + under/on/over with documented bands +
  per-nutrient direction for sodium/energy), `weeklyAveragePerDay`. Pure, no I/O.
- [ ] `src/services/__tests__/mealPlanScore.test.ts` — flatten correctness,
  every status branch, weekly average, empty-week, partial (some recipes
  unenriched contribute partial totals).

### Part 2 — Meal-plan data layer (no migration)
- [ ] `src/hooks/useMealPlan.ts` — read (grouped by day), add, update servings,
  remove, clear. Key `['meal-plan']`. Offline-safe IndexedDB only.
- [ ] `src/hooks/useRecipes.ts` (edit) — extend `useDeleteRecipe` to cascade-delete
  `meal_plan_entries` by the `recipe_id` index in the same transaction; invalidate
  `['meal-plan']` AND the meal-plan nutrition query (`['meal-plan-nutrition']`) so a
  deleted recipe leaves neither a ghost entry nor a stale score.
- [ ] `src/hooks/__tests__/useMealPlan.test.ts` — fake-indexeddb CRUD + the
  cascade path (delete a recipe → its plan entries gone).

### Part 3 — Meal-plan nutrition hook
- [ ] `src/hooks/useMealPlanNutrition.ts` — join plan + referenced recipes'
  persisted nutrition, build `perServingByRecipeId`, return per-day scores +
  weekly summary + per-recipe enrichment status. Reuse `computeNutritionRollup`.
- [ ] `src/hooks/__tests__/useMealPlanNutrition.test.ts` — multi-recipe join,
  unenriched-recipe → partial score, orphan entry skipped, no-profile → no targets.

### Part 4 — UI molecules
- [ ] `src/components/molecules/NutrientRing.tsx` (+ test) — pure SVG % -of-target
  radial gauge: arc encodes percent, with a text value/target + percent label and
  an `aria-label`; under/on/over via role tokens; arc-fill transition `motion-safe:`
  only (color is never the sole signal).
- [ ] `src/components/molecules/ScorePanel.tsx` (+ test) — energy + macros + micros
  rings in a responsive grid; reused for day and week.
- [ ] `src/components/molecules/DayColumn.tsx` (+ test) — a day's recipes, servings
  stepper, remove, add affordance, compact score / empty state. Callbacks up.
- [ ] `src/components/molecules/AddToPlanSheet.tsx` (+ test) — BottomSheet +
  SelectionList recipe picker with planned-servings input; empty state.

### Part 5 — Organism + route wiring
- [ ] `src/components/organisms/WeeklyPlan.tsx` (+ test) — owns the hooks, the
  7-day grid, day-vs-week view, mutations, and the empty-plan / no-profile /
  unenriched states. Scoring renders only once the plan has ≥1 entry; an empty plan
  shows an "add a recipe to a day" empty state, NOT all-zero "under" rings.
- [ ] `src/routes/EatRoute.tsx` (edit) — swap the Weekly Plan `ComingSoonSection`
  for `<WeeklyPlan />`; leave Profile + RecipeLibrary intact.
- [ ] `src/routes/__tests__/EatRoute.test.tsx` (extend) — weekly-plan section
  renders (empty / populated / no-profile branches; mock the hooks).

### Part 6 — E2E
- [ ] `e2e/eat-weekly-plan.spec.ts` — mock `/api/nutrition`; save+enrich → add to a
  day with servings → day rings + weekly summary; edit servings / remove → updates;
  reload offline → persists. Reuse existing IDB-reset/import helpers.

### Part 7 — Validate, offline, docs, ship
- [ ] Verify offline: scored week renders with network off; unenriched recipe shows
  partial + "enrich to score" (manual + E2E assertion).
- [ ] `npm run validate` clean; `npm run test:e2e` green; `npm run build`.
- [ ] Confirm NO `DB_VERSION` bump, NO `package.json` change, NO `.env` change.
- [ ] Draft **ADR-0029** (Eat weekly-plan model & scoring) capturing the four
  contract decisions above; present for approval before saving. (`0025` is missing
  from the sequence — use the next monotonic free number, `0029`, confirmed at draft.)
- [ ] `PLAN.md` — move Current Status to Phase 5 (complete); set "Next" to Phase 6
  (offline/polish/a11y/E2E hardening). Rename this file to
  `tasks/complete--eat-tab-phase-5.md`.
- [ ] Commit (Conventional Commits, `feat:`, NOT migration-gated) + push.

---

## What Phase 5 explicitly does NOT do
- **No new schema / no migration** — writes to the v9 `meal_plan_entries` store
  unchanged; `DB_VERSION` stays 9. (Surface for confirmation; not a `feat(db)`.)
- **No new network surface** — no new `/api/*` function, no new env. Enrichment
  (Phase 4) is reused as-is; the plan/scoring are pure local computation.
- **No meal slots, no dated/multi-week plans** — fixed Mon–Sun grid, flat
  recipe-per-day. Both are clean future additive changes if wanted.
- **No shopping-list nutrition lens** — the backlog's optional secondary lens is
  deferred (revisit only if cheap later).
- **No changes to enrichment, matching, or `normalizeIngredient`** — Phase 5
  consumes Phase 4's output; ADR-0021/0027 untouched.
- **No change to the shopping/import critical paths** — offline check-off, lists,
  default list, import all byte-for-byte intact.

## Risks / things to watch
- **Key alignment is load-bearing.** `flattenTargets` must map the targets' nested
  shape (`protein.grams`, `micros[]`) onto the flat `NutrientTotals` keys exactly,
  or scores silently read the wrong nutrient. Unit-test the adapter hard.
- **Dynamic hook count.** Do NOT call `useRecipeNutrition` once per planned recipe
  (count varies per render → breaks the rules of hooks). One `useMealPlanNutrition`
  query does all joins.
- **Orphan plan entries.** Deleting a recipe must cascade to `meal_plan_entries`;
  the read must also tolerate a stale entry. Both, tested.
- **Partial enrichment must degrade, not throw.** A planned-but-unenriched recipe
  contributes its known partial total and is flagged; scoring never errors offline.
- **No-profile state.** Scoring needs targets; with no profile the plan still
  builds but shows "set up your profile to score" (reuse the EatRoute CTA), not a
  crash or an all-zero score implying a met target.
- **Reduced-motion + color-only meaning (rings).** The ring arc-fill must be
  `motion-safe:` (ADR-0028 called this out for the scoring viz), and the
  under/on/over status must NOT be conveyed by ring color alone — pair every ring
  with a text percent + value/target and an `aria-label`. Rings are harder than
  bars to keep accessible; this is the load-bearing a11y check for the phase.
- **Weekly-average semantics.** Week total ÷ 7 means light days dilute heavy ones;
  document this is "typical day," not "did every day hit target." A reviewer should
  confirm the chosen semantics read correctly in the UI copy.

## Open questions to confirm before coding
(Defaults assumed per the frontmatter `clarifications`; confirm or override.)
- **Week model** — fixed Mon–Sun grid (assumed) vs rolling 7 days vs dated weeks?
- **Day composition** — flat recipe list (assumed) vs breakfast/lunch/dinner slots?
- **Scoring unit** — per-day + weekly avg (assumed) vs week-total-only vs per-day-only?
- **Visualization** — % -of-target **rings** (chosen by the user, 2026-06-30).
- **Shopping-list lens** — deferred (assumed) vs include now?
- **No migration** — confirm `DB_VERSION` stays 9 (writing the pre-created store).

---

**Review**: Self-reviewed (the fresh-session AskUserQuestion gate was unavailable
this session). Five findings folded in: (1) a shared ingredients→cache join helper
so detail-score and plan-score can't drift; (2) a `DAYS` constant as the single
source of truth for grid order + the `day` contract; (3) an explicit empty-plan
state so an unplanned week never reads as a failed target; (4) the recipe-delete
cascade also invalidates the meal-plan nutrition query; (5) ADR number reserved as
0029 (0025 is a gap). Ready to implement, pending user confirmation of the
remaining assumed scope decisions.

**Update (2026-06-30)**: Visualization changed from % -of-target **bars** to
**rings** at the user's request. `NutrientBar` → `NutrientRing` (SVG radial gauge),
with an explicit a11y guard added throughout (text percent + value/target +
`aria-label`, `motion-safe:` arc-fill, color never the sole status signal) since
rings are harder than bars to keep accessible. Week-model, day-composition,
scoring-unit, and shopping-list-lens assumptions are unchanged.
