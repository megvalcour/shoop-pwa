---
epic: eat-tab
phase: 4.1
status: active
class: standard
e2e_required: true
clarifications: |
  A focused UX improvement to the Phase 4 nutrition enrichment pipeline, NOT a new
  phase. Today, when an ingredient is matched to an FDC food but its quantity+unit
  can't be sized, the row shows "Matched to X — couldn't size … Add a weight:" and a
  bare grams input (`RecipeNutrition.tsx`, `status === 'matched-no-grams'`). Users
  are asked to type a gram weight they don't know for units like "1 bunch",
  "2 cans", "1 head", "3 stalks". This task makes that path friendly and
  self-quieting WITHOUT weakening Phase 4's correctness posture.

  Root cause (confirmed in code):
  - `src/utils/measureTokens.ts` `UNITS` already RECOGNIZES bunch/head/sprig/stalk/
    handful/piece/jar/bottle/box/bag/fillet/strip/can/package — so they reach
    `toGrams`. But `src/utils/toGrams.ts` `PER_PIECE_G` only covers clove/stick/
    slice, so everything else falls through to `{ grams: undefined, reason:
    'unresolved' }` unless the matched food happens to carry a fuzzy-matching
    `foodPortions` entry. That `undefined` is what renders the grams prompt.
  - For every `matched-no-grams` row the matched food's `panel.foodPortions` is
    ALREADY cached and present on the row (`row.panel`) — we ask for grams even
    though USDA usually ships the household-measure→gram table right there.

  Chosen approach (the C → A → B recommendation), in priority order:
  - C. Widen `toGrams`' count/container resolution + fuzzy portion matching so most
    of these rows resolve automatically — as LABELED ESTIMATES, never silent.
  - A. When a row still needs input, show the food's `foodPortions` as tappable
    choices ("1 cup (240 g)", "1 medium (110 g)") + a quantity stepper, so the user
    picks a real measure instead of guessing grams. Bare grams entry survives only
    as the last-resort fallback.
  - B. Remember every resolved weight (per `canonical_name|unit`) in the
    `preferences` store so the same ingredient auto-sizes in future recipes — the
    app gets quieter the more it's used. NO `DB_VERSION` bump (KV pattern, like
    `eat_profile`).

  Decisions to lock with the user before implementation (see "Open questions"):
  - CORRECTNESS SHIFT NEEDS AN ADR: widening the tables changes `toGrams`' Spike-2
    guarantee from "return undefined rather than invent a gram weight" to "return a
    LABELED coarse estimate the user can override." ADR-0027 is Accepted/immutable,
    so this is a NEW ADR (proposed ADR-0030) amending that stance, not an edit.
    Confirm the philosophy shift before building.
  - NO SCHEMA BUMP: remembered weights persist as JSON under a `preferences` key
    (`eat_portion_overrides`), exactly like `eat_profile`. `DB_VERSION` stays 9;
    this is therefore NOT a `feat(db)` migration commit. Confirm.
  - NO `package.json` CHANGE expected (pure utils + existing atoms/molecules).
---

# Phase 4.1: Ingredient Weight-Sizing UX

## Relevant ADRs

- **ADR-0027** (Eat nutrition data source, *Accepted*) — governs the `toGrams`
  Spike-2 ladder and its load-bearing rule: *"anything the ladder can't resolve
  confidently returns `grams: undefined`"* rather than inventing a number, because a
  wrong weight corrupts every downstream nutrient. This task **deliberately amends
  that stance** for count/container units (from "block" to "labeled estimate +
  user override"). ADR-0027 is Accepted and immutable, so the change is recorded in
  a NEW ADR (proposed **ADR-0030**), with ADR-0027's `Status` left untouched (this
  refines, not supersedes, its data-source decision). Surface this for review before
  coding (AGENTS.md: contradicting an ADR must be explicit).
- **ADR-0026** (Eat data model, *Accepted*) — `recipe_ingredients.grams` is the
  reserved manual-weight escape hatch this task fills more gracefully; the
  `preferences` store is the KV surface remembered weights use (no new store, no
  migration — the same pattern `eat_profile` uses per `schema.ts`).
- **ADR-0004** (Zustand + TanStack Query split) — remembered weights are PERSISTENT
  (IndexedDB) → a TanStack Query hook in `hooks/`. The in-flight grams/portion edit
  (which row is open, the typed value) is ephemeral → component state, as it is
  today in `RecipeNutrition.tsx`. `toGrams` stays a PURE util: the override map is
  passed IN as an argument (like `foodPortions`), never read from IndexedDB inside
  the util.
- **ADR-0005** (atomic design) — the portion chooser is a presentational MOLECULE
  reading props; the gram math stays a pure util. Reuse existing atoms
  (`Button`, `Input`, `Badge`) and the `BottomSheet`/`SelectionList` molecules (as
  `FoodPickerSheet` already does) before authoring new UI.
- **ADR-0028** (section-scoped green theme) — every surface renders under `/eat`;
  role tokens only, no hardcoded hexes.
- **ADR-0021** (recipe ingredient normalization) — untouched. This task consumes the
  `canonical_name` + `parseIngredientMeasure` quantity/unit already stored on each
  row; it does not change `normalizeIngredient` or `measureTokens`.
- **ADR-0001/0002** (single-repo / IndexedDB offline-first) — everything here is
  offline: portions are already cached on the row, remembered weights live in
  IndexedDB, and no new network call is added.

## Goal

Turn the "couldn't size this — add a weight" dead-end into a friendly, self-quieting
flow, without weakening the "never silently corrupt nutrition" guarantee:

1. **Resolve more automatically (C).** Extend `toGrams` so common count/container
   units (can, bunch, head, stalk, sprig, handful, piece, bag, box, jar, bottle,
   fillet, strip…) resolve to a curated coarse weight, and make FDC `foodPortions`
   lookup fuzzier (singular/plural, "medium/large" modifiers, `can`↔`container`).
   These resolutions are tagged as ESTIMATES (`source: 'estimate'`) so the UI can
   mark them, never presenting a guess as exact.
2. **Ask in real-world measures, not grams (A).** For rows that still need input,
   surface the matched food's `foodPortions` as tappable choices + a quantity
   stepper with a live gram preview. Raw grams entry stays as the final fallback.
3. **Remember what the user tells us (B).** Persist every resolved weight keyed by
   `canonical_name|unit` (as grams-per-unit) in the `preferences` store; consult it
   first for count/container units so the same ingredient never has to be sized
   twice.

## Exit Criteria

- **Estimate-aware `toGrams`** (`src/utils/toGrams.ts`, pure): a widened
  `PER_PIECE_G`/container table and fuzzier `fromPortions`, plus an OPTIONAL
  `overrides?: Record<string, number>` (grams-per-unit keyed by
  `canonical_name|unit`) and `overrideKey` input. New resolution order for
  count/container units: **remembered override → exact FDC portion → curated count
  estimate → unresolved.** A new `GramsSource` value `'estimate'` tags coarse
  count-defaults; `'override'` tags a remembered value. Exact paths (mass, volume/
  density, exact portion) are unchanged and stay un-tagged as estimates. Every
  branch unit-tested, including that an override beats an estimate and that a truly
  unknown unit with no portion still returns `unresolved`.
- **`GramsResult.source` surfaced to the UI:** `useNutrition` returns each row's
  `gramsSource` (`'mass'|'density'|'portion'|'nominal'|'estimate'|'override'`) so
  the panel can distinguish an EXACT size from an ESTIMATE and badge only the
  latter. A new status is NOT needed — an estimated row is `'enriched'` with
  `gramsSource === 'estimate'`; `'matched-no-grams'` remains only for genuinely
  unresolved rows.
- **Remembered-weights hook** (`src/hooks/usePortionOverrides.ts`, new): a TanStack
  Query hook reading/writing a JSON map under the `preferences` key
  `eat_portion_overrides` (`{ "cilantro|bunch": 23, … }` = grams per 1 unit). A
  mutation records `grams / quantity` whenever the user resolves a row (via a
  portion pick or a grams entry). `DB_VERSION` UNCHANGED. Reads are offline; the map
  is loaded once and passed into `toGrams` during enrichment.
- **Enrichment consults overrides** (`src/hooks/useNutrition.ts`): `persistMatch`
  (and the re-pick/manual paths) load the override map and pass the relevant
  grams-per-unit into `toGrams`, so a remembered weight resolves a row with no user
  interaction. `useSetIngredientGrams` (and the new portion-pick mutation) also
  WRITE the override so a manual fix teaches every future recipe.
- **Portion picker UI** (`src/components/molecules/PortionPicker.tsx`, new): a
  presentational chooser listing `panel.foodPortions` as tappable options
  ("1 cup — 240 g") with a quantity stepper and a live "= N g" preview; an
  "Enter grams instead" affordance reveals the existing numeric input as the
  fallback. Pure props (portions, quantity, onPick, onEnterGrams); role tokens.
- **`RecipeNutrition.tsx` rework:** the `matched-no-grams` branch renders
  `<PortionPicker>` (when the food has portions) instead of a bare grams box; the
  grams box is the fallback when it has none or the user opts in. Estimated rows
  (`gramsSource === 'estimate'`) show a subtle "≈ estimated · adjust" affordance
  that opens the same picker to correct the value. Microcopy reframed away from
  "couldn't size" toward "How much is 1 bunch?".
- **Offline:** no new network call. Portions come from the already-cached
  `panel.foodPortions`; overrides come from IndexedDB. Verified with network off.
- **Tests:** unit tests for the widened `toGrams` (each new unit bucket, override >
  estimate precedence, unresolved still unresolved, `source` tags); the
  `usePortionOverrides` hook (fake-indexeddb: read empty, write, read-back, key
  normalization); `useNutrition` (an override auto-sizes a previously unresolved
  unit; a manual grams entry writes the override); and `PortionPicker` /
  `RecipeNutrition` (portion pick sizes the row; estimate badge shows; grams
  fallback still works). `npm run validate` clean.
- **E2E** (`e2e/eat-nutrition.spec.ts`, extend): enrich a recipe with a
  "1 bunch"-style ingredient → row auto-resolves as an estimate (badge visible) OR
  offers a portion pick; pick a portion → row becomes sized and the rollup updates;
  reload → the value persists; a second recipe with the same ingredient+unit
  auto-sizes from the remembered weight. `npm run test:e2e` green
  (`e2e_required: true`).
- **Commit:** Conventional Commits. NOT a schema commit (no `DB_VERSION` bump — KV
  in `preferences`). `feat: friendlier ingredient weight sizing in Eat nutrition`.
  No `package.json` change. New ADR-0030 committed as `docs:` (or folded into the
  feat commit) documenting the estimate-with-override stance.

---

## Design detail

### C — Estimate-aware `toGrams` (`src/utils/toGrams.ts`)

Keep the ladder's exact rungs (mass, volume→density, nominal, exact FDC portion)
byte-for-byte. Change only the count/container branch:

```
count/container unit:
  1. override?  overrides[`${canonical_name}|${unit}`] → grams = perUnit * qty   → source 'override'
  2. exact FDC foodPortions fuzzy match (below)                                   → source 'portion'
  3. curated count estimate (widened PER_PIECE_G + CONTAINER_G)                   → source 'estimate'
  4. else                                                                          → unresolved
```

- **Widened tables (curated, sourced, coarse — hence `'estimate'`):** add sensible
  per-piece / per-container defaults for the units `UNITS` already recognizes but
  the ladder drops today — e.g. bunch, head, stalk, sprig, handful, piece, can,
  package, bag, box, jar, bottle, fillet, strip. Values documented with a source
  comment (USDA "medium" produce weights / typical can + package sizes). These are
  deliberately approximate; the `'estimate'` tag is what keeps them honest.
- **Fuzzier `fromPortions`:** normalize singular/plural and strip size modifiers
  ("1 medium onion" portion matches a bare-count onion; "can"↔"container"), so more
  rows hit the EXACT portion rung (source `'portion'`, not `'estimate'`) before
  falling to the curated default.
- **Purity preserved:** `overrides` is a plain object passed in by the caller;
  `toGrams` does no I/O. `ToGramsInput` gains `overrides?` + `overrideKey?` (or the
  hook pre-resolves the single relevant `perUnit` and passes it as
  `overrideGramsPerUnit?`). Prefer passing the resolved per-unit value to keep the
  util's signature tiny and the precedence logic obvious.

### A — Portion picker (`src/components/molecules/PortionPicker.tsx`)

Presentational. Props: `portions: FdcPortion[]`, `quantity`, `unitLabel`,
`onPick(grams)`, `onEnterGramsInstead()`, plus the existing controlled grams-input
props for the fallback. Renders each portion as a chip — `"{amount} {unit} — {gram
Weight} g"` — and a small quantity stepper; the live preview shows
`selectedPerUnit * quantity` grams. "Enter grams instead" swaps in the current
numeric `Input`. No store access, no hook — the parent (`RecipeNutrition`) owns the
mutations, exactly as it owns `pickFood`/`setGrams` today.

### B — Remembered weights (`src/hooks/usePortionOverrides.ts` + `preferences`)

- **Shape:** `Record<string, number>` under `preferences` key
  `eat_portion_overrides`, value = grams for ONE unit (so it scales by `quantity`).
  Key = `` `${canonical_name}|${normalizeUnit(unit)}` `` (reuse `toGrams`'
  `normalizeUnit` spirit so "Bunch"/"bunches" collapse — extract the normalizer to a
  shared spot if cleaner, else mirror it and unit-test parity).
- **Read:** one query, `queryKey: ['eat','portionOverrides']`, returns the parsed
  map (empty object when unset). Loaded by `useNutrition` before enrichment and
  passed into `toGrams`.
- **Write:** a mutation upserts `grams / quantity` for a key and invalidates the map
  + the affected recipe's nutrition query. Called from BOTH resolution paths
  (portion pick and grams entry). Guard `quantity > 0`.
- **No migration:** JSON-in-`preferences`, identical to `EatProfile`. `DB_VERSION`
  stays 9.

### Precedence & correctness

The correctness guarantee shifts from *"block until the user gives an exact number"*
to *"never present a guess as exact."* Concretely: exact rungs render plainly;
`'estimate'` rows are visibly badged and one tap from correction; a user's correction
becomes an `'override'` that outranks the estimate everywhere thereafter. Unknown
units with no portion and no override still return `unresolved` → the (now friendlier)
manual path. This is the substance of proposed ADR-0030.

## Implementation Steps

### Part 0 — ADR (do first; gates the rest)
- [ ] `docs/adrs/0030-ingredient-weight-estimate-and-overrides.md` (proposed →
  Accepted after user confirms): records the shift from ADR-0027's "unresolved
  rather than invent" to "labeled estimate + remembered override," the precedence
  order, the `'estimate'`/`'override'` source tags, and the `preferences`-KV
  (no-migration) choice for remembered weights. Leave ADR-0027 `Status` untouched
  (refinement, not supersession).

### Part 1 — Pure `toGrams` widening (C)
- [ ] `src/utils/toGrams.ts` — widen `PER_PIECE_G`, add `CONTAINER_G`, make
  `fromPortions` fuzzier, add the `override` rung + `'estimate'`/`'override'`
  sources, extend `GramsSource`/`ToGramsInput`. Keep exact rungs unchanged.
- [ ] `src/utils/__tests__/toGrams.test.ts` — new buckets, override > estimate,
  fuzzy portion match, unresolved-still-unresolved, correct `source` per rung.

### Part 2 — Remembered weights (B)
- [ ] `src/hooks/usePortionOverrides.ts` — read/write the `eat_portion_overrides`
  map in `preferences`; key normalizer; grams-per-unit math. NO `DB_VERSION` bump.
- [ ] `src/hooks/__tests__/usePortionOverrides.test.ts` — fake-indexeddb: empty
  read, upsert, read-back, key normalization (case/plural), quantity guard.

### Part 3 — Enrichment wiring
- [ ] `src/hooks/useNutrition.ts` — load the override map and pass the resolved
  per-unit into `toGrams` in `persistMatch` (and the re-pick path); surface
  `gramsSource` on `IngredientNutrition`; have `useSetIngredientGrams` + a new
  `useSetIngredientPortion` mutation WRITE the override alongside the row's `grams`.
- [ ] `src/hooks/__tests__/useNutrition.test.ts` (extend) — an override auto-sizes a
  previously-unresolved unit with no interaction; a grams entry persists an override;
  `gramsSource` is reported.

### Part 4 — UI
- [ ] `src/components/molecules/PortionPicker.tsx` (new) + `__tests__` — chips +
  stepper + live preview + grams fallback; pure props.
- [ ] `src/components/organisms/RecipeNutrition.tsx` — render `<PortionPicker>` in
  the `matched-no-grams` branch (grams box as fallback); add the "≈ estimated ·
  adjust" affordance for `gramsSource === 'estimate'`; reframe microcopy; wire the
  portion-pick + grams mutations (both write the override).
- [ ] `src/components/organisms/__tests__/RecipeNutrition.test.tsx` (extend) —
  portion pick sizes the row; estimate badge renders; grams fallback still works.

### Part 5 — E2E + validate + ship
- [ ] `e2e/eat-nutrition.spec.ts` (extend) — estimate/auto-resolve, portion pick →
  rollup update → persistence, and cross-recipe remembered auto-size. Reuse the
  existing mocked `/api/nutrition` + IDB-reset helpers.
- [ ] `npm run validate` clean; `npm run test:e2e` green; `npm run build` clean.
- [ ] Confirm NO `DB_VERSION` bump, NO `package.json` change.
- [ ] `PLAN.md` — reflect this improvement; on completion rename this file to
  `tasks/complete--ingredient-weight-sizing-ux.md`.
- [ ] Commit (`feat:`, not migration-gated); push to
  `claude/ingredient-weight-sizing-ux-ez2tp5`.

---

## What this explicitly does NOT do
- **No `DB_VERSION` bump / no migration** — remembered weights are JSON in the
  existing `preferences` store (the `eat_profile` pattern). Surface for review.
- **No `normalizeIngredient` / `measureTokens` change** — the unit vocabulary
  already recognizes these units; only `toGrams`' resolution of them changes.
- **No new network call** — portions are already cached on the row; overrides are
  local. The offline critical path is untouched.
- **No new dependency** — pure utils + existing atoms/molecules. Ask before any
  `package.json` change (AGENTS.md).
- **No change to FDC food matching** — which food a row matches to (search + rerank
  + `FoodPickerSheet` re-pick) is unchanged; this task is purely about SIZING an
  already-matched food.
- **No auto-invention presented as fact** — coarse defaults are always tagged
  `'estimate'` and visibly badged; the guarantee becomes "never present a guess as
  exact," not "never guess."

## Risks / things to watch
- **Correctness-posture change is the #1 review surface.** Moving from
  "unresolved → block" to "labeled estimate" is a real philosophy shift on a
  load-bearing nutrition path. It MUST be visible (badge) and correctable, and it
  needs ADR-0030 before code. Estimated values feeding the rollup silently would be
  a regression against ADR-0027's intent.
- **Estimate quality.** Coarse per-piece/container weights vary wildly (a "bunch"
  of parsley ≠ a "bunch" of bananas). Keep the table small and defensible; lean on
  exact FDC portions first; make correction one tap. Consider whether some units are
  too variable to estimate and should stay `unresolved`.
- **Override key collisions / staleness.** `canonical_name|unit` is intentionally
  food-agnostic (max reuse), but if a user later matches the same phrase to a very
  different food the remembered grams still apply. Acceptable for a single-user app;
  note it. No eviction policy in v1 (mirrors `nutrition_cache`).
- **Purity of `toGrams`.** The override must be passed IN; reading IndexedDB inside
  the util would break its Spike-2 testability. Keep the signature minimal.
- **Rollup partial-state semantics unchanged.** An `'estimate'` row COUNTS toward
  the rollup (it has grams); only genuinely `unresolved` rows stay excluded. Confirm
  `nutritionRollup` needs no change (it keys off `grams`/`panel` presence only).

## Open questions to confirm before coding
- **ADR-0030 / posture shift** — OK to amend ADR-0027's "never invent grams" to
  "labeled estimate + user override" for count/container units? (Recommended; it's
  what makes the UX friendly. Requires the new ADR.)
- **No migration** — confirm remembered weights ship as JSON in `preferences` (no
  `DB_VERSION` bump), like `eat_profile`. (Recommended.)
- **Override key** — `canonical_name|unit` (max cross-recipe reuse, food-agnostic —
  recommended) vs `fdc_id|unit` (precise, less reusable)?
- **Estimate visibility** — a subtle "≈ estimated" badge with tap-to-adjust
  (recommended) vs auto-resolve silently vs keep an explicit confirm step?
- **Table breadth** — curated small v1 set (bunch/head/stalk/sprig/handful/can/
  package/bag/box/jar/bottle/fillet/strip — recommended) vs a broader bundled table?
- **Units too variable to estimate** — any units (e.g. "handful", "bunch") that
  should stay `unresolved` and always ask, rather than estimate?
