# Eat — Day Detail View (full macros & micros per day)

## Goal

Keep the current Eat weekly-plan view unchanged, but let each day card link to a
**day detail view** showing that day's **full** macro **and** micronutrient
values — the same rich panel the weekly "typical day" summary already renders,
scoped to a single day of the week.

Today the per-day card ([DayColumn.tsx](../src/components/molecules/DayColumn.tsx))
only renders `ScorePanel variant="compact"` (energy + the 3 macros). The full
per-day data — including all micros — is **already computed** upstream; it's just
not surfaced. This feature is almost entirely wiring existing pieces into a new
route. **No schema, no `DB_VERSION` bump, no new network surface, no
`package.json`/`.env` change.**

## Decisions (confirmed)

- **Read-only nutrition detail.** The detail page shows the full nutrition panel
  plus the day's recipe list; all editing (add/remove/servings) stays on the week
  grid. Keeps scope tight and avoids duplicating the stepper controls.
- **No-profile fallback = raw totals.** When there is no profile (no targets), the
  detail shows the day's full macro/micro values via the existing
  [NutritionPanel.tsx](../src/components/molecules/NutritionPanel.tsx) (values, no
  rings/percentages). With a profile, it shows the scored rings.

## ADR check

- **ADR-0029** (Eat weekly-plan model & scoring) fixes a single implicit "this
  week" plan on a Mon–Sun day-of-week grid, with per-day-vs-daily-target scoring
  and rings. A `/eat/plan/:day` detail keyed on the existing `DayKey` contract is
  **consistent** with ADR-0029 — it adds no dates, no week picker, no new meal
  slots, and reuses the same scoring path. No new ADR required.
- **ADR-0028** (section-scoped green sub-theme): the new route renders under `/eat`
  and uses role tokens only, so it inherits the green theme automatically.
- **ADR-0005** (no store access in molecules): the day→detail navigation is a
  callback up from `DayColumn` to the `WeeklyPlan` organism, matching the existing
  `onAddRecipe`/`onEnrich` pattern.

## Data availability (no new query needed)

[useMealPlanNutrition.ts](../src/hooks/useMealPlanNutrition.ts) already returns, per
day, a `DayScore` with:

- `totals: NutrientTotals` — always present (energy + all macros + all micros).
- `scores: NutrientScore[] | null` — the **full** scored set (energy + macros +
  micros), null only when there are no targets.

The weekly summary renders this exact `scores` array through
`ScorePanel variant="full"`. The day detail renders the **same** array for one
day. Because the hook is a single cached TanStack query keyed on the flattened
targets, navigating to the detail **reuses the already-fetched week nutrition** —
offline by construction (pure IndexedDB reads).

## Implementation steps

### 1. Route + navigation plumbing

- **`src/App.tsx`** — add a route `{ path: 'eat/plan/:day', element: <DayDetailRoute /> }`
  under the AppShell children, next to the other `eat/*` routes. Import the new
  route component.
- **`DayColumn.tsx`** — add an `onViewDay: () => void` prop and make the day
  heading a link/button to it (e.g. the `<h3>{label}</h3>` becomes a tappable row
  or gains a chevron "View day" affordance). Keep it a callback-up (no router
  import in the molecule). Add an `aria-label` like `View ${label} details`.
  - Update [DayColumn.test.tsx](../src/components/molecules/__tests__/DayColumn.test.tsx)
    for the new prop + interaction.
- **`WeeklyPlan.tsx`** — pass `onViewDay={() => navigate('/eat/plan/${day.key}')}`
  into each `DayColumn`. (Template literal with the real `day.key`.)

### 2. `DayDetailRoute`

New file **`src/routes/DayDetailRoute.tsx`** (mirror
[RecipeDetailRoute.tsx](../src/routes/RecipeDetailRoute.tsx) structure/altitude):

- `const { day } = useParams<{ day: string }>();`
- Guard: if `!isDayKey(day)` (from `mealPlanDays.ts`), render a "day not found" +
  "Back to Eat" fallback (mirrors RecipeDetailRoute's not-found block).
- Resolve the day label via `DAYS.find(d => d.key === day)`.
- Data: same trio the `WeeklyPlan` organism uses —
  `useEatProfile()` → `computeTargets(profile)` → `useMealPlanNutrition(targets)`
  and `useMealPlan()` for the day's placed recipes.
- Header: `<h1>` day label, subtext = planned-recipe count for the day.
- Recipe list (read-only): the day's `plan?.byDay[day]` entries, each showing the
  recipe title + planned servings. Titles link to `/eat/recipes/:id`. If a placed
  recipe still needs enrichment (from `nutrition.data.recipeEnrichment`), show the
  same "Enrich to score" link → recipe detail. (Extract a small read-only
  presentational piece **or** inline it — do NOT reuse DayColumn's editable list,
  which carries the steppers.)
- Nutrition panel:
  - If `dayScore.scores` (has targets): `<ScorePanel scores={dayScore.scores} variant="full" />`.
  - Else: `<NutritionPanel totals={dayScore.totals} />` (raw values) + the same
    "Set up your profile to score this day" hint used on the week view.
- Empty day: if the day has no entries, show a "Nothing planned for {label}" state
  with an "add on the week view"/back affordance (no all-zero "under" rings).
- Loading: while `nutrition.isPending`, render the shared "Loading…" state.

### 3. Optional small extraction (only if it reads cleanly)

If the read-only recipe row + enrich link is non-trivial, factor a
`PlannedRecipeList` (read-only) molecule so both the detail route and a future
surface share it. Otherwise inline — don't over-engineer.

## Files touched

- `src/App.tsx` — new route.
- `src/routes/DayDetailRoute.tsx` — **new**.
- `src/components/molecules/DayColumn.tsx` — `onViewDay` prop + heading link.
- `src/components/organisms/WeeklyPlan.tsx` — wire `onViewDay`.
- Tests: `DayColumn.test.tsx` (updated), new `DayDetailRoute.test.tsx`
  (has-profile → full rings incl. a micro; no-profile → NutritionPanel values;
  invalid `:day` → not-found; empty day → empty state).

## Explicitly NOT in scope

- No editing on the detail page (servings/add/remove stay on the week grid).
- No schema/DB change, no new hook/query (reuse `useMealPlanNutrition`).
- No changes to scoring math or `mealPlanScore`/`nutritionRollup`.
- No dates / week picker (ADR-0029 unchanged).

## Verification

- `npm run validate` (typecheck + lint + Vitest).
- `npm run test:e2e` — the plan touches routing/navigation; add/adjust an E2E that
  taps a day card → asserts the day detail shows a micro readout (e.g. Potassium)
  that the compact week card does not.
- Manual: profile set → day rings incl. micros; profile cleared → raw totals;
  offline (already-loaded) → still renders (cached query).
