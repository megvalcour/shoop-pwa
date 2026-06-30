# Model the Eat weekly plan as a fixed Mon–Sun day-of-week grid scored per-day against the daily targets, visualized as %-of-target rings

## Status

Accepted

## The Problem

Phase 5 turns enriched recipes into a planned, scored week. ADR-0026 created the
`meal_plan_entries` store but deliberately deferred four contract decisions to this
phase: how a day is keyed, how a day is composed, what the scoring denominator is,
and how the score is shown. Each of these constrains future work, so they are fixed
here rather than left implicit in the code.

## The Solution

- **Week model — fixed Mon–Sun grid.** `meal_plan_entries.day` holds a day-of-week
  key (`'mon'…'sun'`), defined once in `src/services/mealPlanDays.ts` as the single
  source of truth for both grid order and the `day` contract. There is one implicit
  "this week" plan — no dates, no week picker.
- **Day composition — flat recipe list.** One entry = one recipe placed on one day
  with a `planned_servings` count. The same recipe may appear on multiple days (two
  entries) or twice on one day. There are no breakfast/lunch/dinner meal slots.
- **Scoring unit — per-day vs the daily targets, plus a weekly average-per-day
  summary.** Each day's planned nutrition is summed from the Phase 4 per-serving
  rollups and scored against the Phase 2 daily targets; the weekly summary is the
  week total ÷ 7 ("a typical day this week") against the same daily targets.
- **Visualization — %-of-target rings.** Energy + the three macros + the curated
  micro panel render as SVG radial gauges (`NutrientRing`), under/on/over colored
  via role tokens, each paired with a text percent + value/target + `aria-label`.

No `DB_VERSION` bump: the v9 `meal_plan_entries` store already has the exact shape
this phase needs, so Phase 5 writes to it but changes no store shape — this is not a
migration. No new network surface: the plan and its scoring compute entirely from
already-persisted data, so a scored week works fully offline.

## Options Considered

- **Day-of-week key (grid)** — selected. Rejected: an ISO-date rolling 7-day window
  and multi-week dated plans — heavier (a week picker, date math, history) and
  unjustified for a single user in v1.
- **Flat recipe-per-day** — selected. Rejected: breakfast/lunch/dinner `slot` field
  + slot UI — more model and surface than v1 needs.
- **Per-day + weekly-average scoring** — selected. Rejected: week-total-only (hides
  daily balance) and per-day-only (no at-a-glance week read).
- **%-of-target rings** — selected by the user (2026-06-30), over bars. Rings are
  harder to keep accessible, which is why the a11y pairing (text + aria-label +
  `motion-safe:` fill) is mandatory, not optional.
- **Shopping-list nutrition lens** — deferred (the backlog's optional secondary
  lens); revisit only if cheap on a later pass.

## Rationale

The rollup (`NutrientTotals`, Phase 4) and the targets (`NutritionTargets`, Phase 2)
were deliberately given the **same nutrient key set** in Phase 4, so scoring is a
straight key match with no mapping table — the only adapter is `flattenTargets`
(nested target shape → flat key space). The `under`/`on`/`over` band (90–110%) and
the per-nutrient direction (`meet` floor, `limit` cap for sodium, `target` band for
energy) live as documented, swappable constants in `mealPlanScore.ts`, mirroring the
Phase 2 macro-split policy.

A day-of-week grid (vs dated weeks) is the smallest model that delivers a planned,
scored week for a single offline user, and it keeps the `day` contract trivially
serializable. Both the slot dimension and dated/multi-week plans are **clean future
additive changes** (a new `slot` field; a new ADR superseding the `day` semantics) —
nothing here forecloses them.

Weekly average = week total ÷ 7 means light days dilute heavy ones, so it reads as
"typical day," NOT "every day hit target"; the UI copy says so explicitly.

Consistency is preserved by an **orphan cascade**: deleting a recipe cascade-deletes
its `meal_plan_entries` (via the `recipe_id` index) in the same transaction, and the
plan read also defensively skips any entry whose recipe is gone or whose `day` is
off-grid. `resetUserData` continues NOT to wipe Eat stores (the Phase 3 decision), so
the plan survives reset just as recipes do — consistency rides on the cascade, not on
reset.

## Notes

- **Reduced-motion + color-only meaning (ADR-0028).** ADR-0028 flagged that "the
  Phase 5 scoring visualization must honor reduced-motion." `NutrientRing`'s arc-fill
  transition is `motion-safe:` only, and the under/on/over status is never carried by
  color alone — every ring pairs with a text percent, a value/target readout, and an
  `aria-label` ("Protein: 82 of 120 g, 68% of target").
- **No-profile state.** Scoring needs targets; with no profile the plan still builds
  and sums, but scores are withheld with a "set up your profile to score" hint rather
  than rendering all-zero "under" rings that would imply a met/failed target.
- **Empty-plan state.** An unplanned week shows an "add a recipe to a day" prompt, not
  all-zero rings — an empty plan is not a failed target.
- **One join path.** The ingredients→`nutrition_cache` join is extracted into
  `db/recipeNutritionRead.ts` and shared by both `useRecipeNutrition` (detail score)
  and `useMealPlanNutrition` (plan score), so a recipe can never score differently in
  the two places. `useMealPlanNutrition` does all recipe joins in one query (not
  `useRecipeNutrition` per recipe, which would vary the hook count per render).
- **Relationship to prior ADRs:** exercises ADR-0026's `meal_plan_entries` store for
  the first time and fixes its deferred `day` format; consumes Phase 4's rollup
  output unchanged (ADR-0027 untouched); renders under ADR-0028's green sub-theme.
  `0025` is absent from the ADR sequence; `0029` is the next monotonic free number.
