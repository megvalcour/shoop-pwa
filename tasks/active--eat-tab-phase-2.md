---
epic: eat-tab
phase: 2
status: planning
class: standard
e2e_required: true
clarifications: |
  Phase 2 of the "Eat" tab epic (`tasks/backlog--eat-tab.md`). This is the
  PROFILE + COMPUTED TARGETS phase: capture the single user's body/lifestyle
  profile and display daily nutrition targets computed on-device. No nutrition
  fetch, no recipes, no plan — those are Phases 3–5. It hangs real, data-driven
  content on the Phase 1 shell, replacing the static "Profile" stub in
  `EatRoute` with a working profile + targets surface.

  Decisions locked with the user before planning (2026-06-30):
  - STORAGE: the profile persists as a single JSON-serialized value in the
    existing `preferences` store under one key. **No new object store, no
    DB_VERSION bump, no migration, no new ADR.** ADR-0026's four Eat stores
    (DB_VERSION 9) stay reserved for Phase 3/4. This keeps Phase 2 schema-free,
    consistent with Phase 1.
  - MICROS: v1 ships a CURATED micronutrient panel (fiber, sodium, calcium,
    iron, potassium, vitamin C, vitamin D), sex/age-aware DRI values. Broader
    coverage deferred to a later phase.
  - UNITS: imperial default (lb, ft/in) with a metric toggle (kg, cm). All math
    runs in metric internally; the stored profile persists canonical metric
    values plus the user's display-unit preference.
---

# Phase 2: "Eat" Tab — Profile Capture + Locally-Computed Targets

## Relevant ADRs

- **ADR-0004** (Zustand + TanStack Query split, in force) — the profile is
  PERSISTENT data, so it goes through a TanStack Query hook backed by IndexedDB
  (`preferences`), **not** Zustand. Zustand stays for ephemeral UI only (e.g. an
  unsaved-edits form buffer is local component state, not a store).
- **ADR-0002 / ADR-0015 `preferences` precedent** — `preferences` is the
  established key/value store for app-level singletons (`active_store_id`). The
  profile is another app-level singleton for the single user (per AGENTS.md), so
  it reuses this store via a new key rather than a bespoke store. `Preference.value`
  is typed `string`, so the profile is JSON-serialized on write / parsed on read.
- **ADR-0026** (Eat data model, *Accepted*) — cited for its BOUNDARY: it reserves
  DB_VERSION 9 and four stores for recipes/plan/nutrition in Phase 3/4. **Phase 2
  does NOT touch `schema.ts` beyond adding a TypeScript interface for the profile
  shape (no `ShoopDB` store entry, no `DB_VERSION` change).** The profile is
  deliberately NOT one of ADR-0026's stores — confirm this is not read as a
  deviation from that ADR.
- **ADR-0028** (section-scoped green theme, in force) — the new profile/targets UI
  renders under `/eat`, so it inherits the green sub-theme automatically via the
  `data-theme="eat"` cascade. Use the role tokens (`bg-card`, `text-text`,
  `text-text-muted`, `bg-primary`, `text-accent`, `shadow-card`) so the new
  surfaces retheme green with zero per-component color work. Do NOT hardcode hexes.
- **ADR-0005** (atomic design, in force) — the form that reads/writes the profile
  hook is an **organism**; the pure presentational pieces (a labeled field row, a
  single target readout) are **atoms/molecules** with no store access. Reuse the
  existing `Input` and `Button` atoms before authoring new ones.

## Goal

Let the single user enter their age, sex, weight, height, and activity level
(imperial-default, metric-toggle), persist it locally, and immediately see their
computed daily nutrition targets — energy (kcal), the three macros (protein,
carbs, fat), plus a curated micronutrient panel — all derived on-device with pure
math (Mifflin–St Jeor → TDEE → splits + DRI). Editing the profile recomputes the
targets. No network, no PII leaves the device.

## Exit Criteria

- The `/eat` landing replaces the static **Profile** stub with a real, data-driven
  section that is state-aware: **no profile yet** → a "Set up your profile" empty
  state with a call to action; **profile set** → a compact profile summary plus the
  computed daily targets.
- A profile capture/edit form (organism) collects: age, sex (`female`/`male`),
  weight, height, activity level (5 standard levels), and a units toggle
  (imperial/metric). Validates ranges; disables save on invalid input.
- The profile persists to the `preferences` store as a single JSON value under a
  documented key and survives reload. **No `DB_VERSION` bump; no new `ShoopDB`
  store; no migration case.**
- A pure, I/O-free `nutritionTargets` service computes energy + macros + the
  curated micro panel from the stored (metric) profile. Fully unit-tested against
  hand-checked Mifflin–St Jeor / DRI reference values.
- Targets render in the green sub-theme and recompute live when the profile is
  edited (TanStack Query invalidation; no stale numbers).
- Unit tests: the targets math service (the bulk), the profile hook
  (serialize/parse round-trip + default fallback), unit-conversion helpers, the
  form (validation + submit), and the route's empty-vs-populated branch.
  `npm run validate` clean.
- E2E: from a clean state, open Eat → see the empty profile CTA → fill the form →
  save → see computed targets; reload → targets persist. `npm run test:e2e` green.
- No `package.json` change (no new dependency — all math is hand-written; existing
  atoms/icons suffice).

---

## Data Shape (TypeScript only — no store)

Add to `src/db/schema.ts` (interface only; **not** added to the `ShoopDB`
interface, since it lives inside `preferences.value` as JSON):

```ts
export type Sex = 'female' | 'male';
export type ActivityLevel =
  | 'sedentary'      // 1.2
  | 'light'          // 1.375
  | 'moderate'       // 1.55
  | 'active'         // 1.725
  | 'very_active';   // 1.9
export type UnitSystem = 'imperial' | 'metric';

/**
 * The single user's body/lifestyle profile, persisted as JSON under the
 * `eat_profile` key in the `preferences` store. Canonical fields are METRIC
 * (kg, cm); `units` records only the user's preferred DISPLAY system so the
 * form re-renders in their chosen units. Math always runs on the metric fields.
 */
export interface EatProfile {
  age: number;          // years
  sex: Sex;
  weightKg: number;     // canonical metric
  heightCm: number;     // canonical metric
  activity: ActivityLevel;
  units: UnitSystem;    // display preference only
  updated_at: number;   // epoch ms
}
```

- Key constant lives in `src/db/idbClient.ts` next to `ACTIVE_STORE_ID_KEY`:
  `export const EAT_PROFILE_KEY = 'eat_profile';`
- **Why metric-canonical:** storing one canonical unit keeps the math service
  unit-agnostic and avoids drift from repeated lb↔kg round-trips on every edit.
  The display toggle converts at the UI edge only.

## Computation Model (the pure service)

`src/services/nutritionTargets.ts` — **no imports from `db/`, `hooks/`, React, or
the network. Pure functions, deterministic, fully unit-tested.**

1. **BMR — Mifflin–St Jeor:**
   `10*weightKg + 6.25*heightCm − 5*age + s`, where `s = +5` (male) / `−161`
   (female).
2. **TDEE:** `BMR × activityFactor[activity]` using the factors above.
3. **Macro targets (default split, documented as v1 policy):**
   - Protein: `1.6 g/kg` bodyweight (evidence-based general target), → kcal `×4`.
   - Fat: `30%` of TDEE kcal, → grams `÷9`.
   - Carbs: remaining kcal after protein+fat, → grams `÷4`.
   - Record this split policy in a code comment + the plan so it's reviewable; it
     is intentionally simple and swappable later.
4. **Curated micro panel (DRI, sex/age-aware where the DRI differs):** fiber,
   sodium (upper-limit/AI), calcium, iron, potassium, vitamin C, vitamin D. A
   small static table keyed by sex (and the one or two age brackets that matter,
   e.g. iron drops post-51, calcium rises post-51/post-71) — keep the bracket set
   minimal and cite the DRI source values in a comment. Return units per nutrient
   (g/mg/mcg).
5. **Output shape:**
   ```ts
   interface NutritionTargets {
     energyKcal: number;
     protein: { grams: number };
     fat: { grams: number };
     carbs: { grams: number };
     micros: Array<{ key: string; label: string; amount: number; unit: string }>;
   }
   ```
   Round for display at the UI layer, not in the service (keep raw precision for
   testability and future per-day math).

> **Edge handling:** the service assumes a valid profile (the form guarantees
> ranges). Guard against divide-by-zero / negative only as cheap assertions; the
> form is the real validation boundary.

## Implementation Steps

### Part 1 — Profile persistence hook

- [ ] **`src/db/idbClient.ts`** — add `EAT_PROFILE_KEY = 'eat_profile'` next to the
  existing key constants. No other change.
- [ ] **`src/db/schema.ts`** — add the `EatProfile` interface + the `Sex`,
  `ActivityLevel`, `UnitSystem` types (above). **Do not** add a store to `ShoopDB`;
  **do not** bump `DB_VERSION`.
- [ ] **`src/hooks/useEatProfile.ts`** (new) — mirror `usePreferences.ts`:
  - `useEatProfile()` → `useQuery(['preferences', EAT_PROFILE_KEY])`; `queryFn`
    reads `preferences.get(EAT_PROFILE_KEY)`, `JSON.parse`es `value`, returns
    `EatProfile | null` (null when unset or unparseable — never throw on a bad blob).
  - `useSetEatProfile()` → `useMutation` that `JSON.stringify`es and `put`s
    `{ key: EAT_PROFILE_KEY, value }`, then invalidates the query key. Keep the
    optimistic/offline posture of the existing preference mutations (this is purely
    local, so it's already offline-safe).

### Part 2 — Unit conversion helpers

- [ ] **`src/services/units.ts`** (new, pure) — `lbToKg`/`kgToLb`,
  `inToCm`/`cmToIn`, and `ftInToCm`/`cmToFtIn` (height is entered as ft+in in
  imperial). Small, exhaustively unit-tested. The form uses these at the edge;
  storage stays metric.

### Part 3 — Targets math service

- [ ] **`src/services/nutritionTargets.ts`** (new, pure) — implement the model
  above: `computeBmr`, `computeTdee`, `computeTargets(profile): NutritionTargets`,
  and the DRI micro table. Export the activity-factor map and the DRI table so
  tests can reference them. **No I/O, no React.**

### Part 4 — Profile form (organism) + field molecule

- [ ] **`src/components/molecules/LabeledField.tsx`** (new IF a suitable one doesn't
  already exist — check `ItemEntryForm`/`Input` usage first) — a label + control row
  (label, the `Input` atom or a `<select>`, optional unit suffix, optional error
  text). Presentational only, no store access. If `ItemEntryForm` already provides a
  reusable field pattern, extract/reuse rather than duplicate.
- [ ] **`src/components/organisms/EatProfileForm.tsx`** (new) — reads `useEatProfile`
  to seed initial values, holds an in-component draft state (not Zustand), renders:
  - Age (number), Sex (segmented/select), Weight + Height (inputs whose unit suffix
    + parsing follow the units toggle), Activity (select of the 5 levels with plain
    labels), Units toggle (imperial/metric — converts the visible numbers in place).
  - Range validation (age ~13–100, weight/height sane bounds); `Button` (existing
    atom) disabled until valid + dirty; on submit converts to metric and calls
    `useSetEatProfile`.
  - Reuse `Input` and `Button` atoms; theme via role tokens so it renders green
    under `/eat`. Use a native `<select>` styled with the border/card tokens unless
    a select atom already exists.

### Part 5 — Targets display (molecule/organism) + EatRoute wiring

- [ ] **`src/components/molecules/TargetReadout.tsx`** (new) — presentational: one
  target row/card (label, value, unit), used for energy, each macro, and each micro.
  No store access. Styled with role tokens (green via cascade).
- [ ] **`src/components/organisms/DailyTargets.tsx`** (new) — takes a `NutritionTargets`
  (computed by the route from the profile) and lays out energy + macros + the curated
  micro panel using `TargetReadout`. Pure props-in; the route owns the
  profile→targets computation so this stays testable without hooks.
- [ ] **`src/routes/EatRoute.tsx`** (edit) — replace the static **Profile**
  `ComingSoonSection` with the real, state-aware Profile section:
  - `const { data: profile } = useEatProfile();`
  - **No profile:** an empty-state card ("Set up your profile to see your daily
    targets") that reveals/links to `EatProfileForm` (inline disclosure or a
    `BottomSheet` — reuse the existing `BottomSheet` molecule to match app
    conventions rather than a new modal).
  - **Profile set:** a compact summary (age/sex/activity + an "Edit" affordance that
    re-opens the form) followed by `<DailyTargets targets={computeTargets(profile)} />`.
  - Keep the **Recipes** and **Weekly Plan** `ComingSoonSection` stubs untouched
    (Phases 3 & 5). The intro heading stays.
  - The route now reads a hook → it remains a route/organism-level component, which is
    allowed (ADR-0005); keep computation (`computeTargets`) at this boundary so the
    display components stay pure.

### Part 6 — Unit tests

- [ ] **`src/services/__tests__/nutritionTargets.test.ts`** — the core suite:
  BMR/TDEE against hand-computed reference values for a couple of known
  profiles (one female, one male, varied activity); macro gram math; micro table
  returns the right sex/age-bracketed DRI values; output shape. This is the
  highest-value test surface in the phase.
- [ ] **`src/services/__tests__/units.test.ts`** — round-trip + known conversions
  (e.g. 70 kg ↔ 154.32 lb; 175 cm ↔ 5 ft 8.9 in), boundary rounding.
- [ ] **`src/hooks/__tests__/useEatProfile.test.ts`** — serialize/parse round-trip;
  `null` on unset; `null` (not throw) on a corrupt blob; set→invalidate path. Mirror
  the existing hook test setup (fake-indexeddb or the repo's established pattern).
- [ ] **`src/components/organisms/__tests__/EatProfileForm.test.tsx`** — validation
  disables save; units toggle converts visible values; submit writes metric.
- [ ] **`src/routes/__tests__/EatRoute.test.tsx`** (extend Phase 1 smoke test) —
  empty-state CTA when no profile; targets render when a profile is present (mock the
  hook). Keep the existing Recipes/Weekly-Plan stub assertions.

### Part 7 — E2E

- [ ] **`e2e/eat-profile.spec.ts`** (new) — from a clean IndexedDB: navigate to Eat →
  assert the "set up your profile" empty state → open the form → fill age/sex/weight/
  height/activity → save → assert computed targets appear (energy + at least one
  macro + one micro) → reload the page → assert the targets persist (profile survived
  in `preferences`). Confirm the surface is green (inherits `data-theme="eat"` — a
  light assertion is enough since Phase 1 already covers the theme switch).
- [ ] Reuse the existing E2E IndexedDB-reset/setup helpers; don't fork new harness.

### Part 8 — Validate, document, ship

- [ ] `npm run validate` (typecheck + lint + Vitest) clean.
- [ ] `npm run test:e2e` green (`e2e_required: true`; `validate` does not cover it).
- [ ] Confirm the diff has **no `DB_VERSION` change**, **no new `ShoopDB` store**, and
  **no migration case** — Phase 2 is schema-free by design (profile lives in
  `preferences`). Confirm **no `package.json` change**.
- [ ] **`PLAN.md`** — move "Current Status" to Phase 2 (active) referencing this file;
  update the "Next" line to Phase 3 (persisted recipes). On completion, rename this
  file to `tasks/complete--eat-tab-phase-2.md` per the AGENTS.md convention and drop
  the Phase 2 line from the backlog's open-questions where resolved (units + micro
  coverage are now decided).
- [ ] Commit with Conventional Commits. Net-new user-facing feature, **no schema
  change** → **`feat:`** (e.g. `feat: add Eat profile capture and computed daily
  nutrition targets`). No `DB_VERSION` bump → no ADR-0017 migration gate. Push to
  `claude/eat-tab-next-phase-rp0l71`.

---

## What Phase 2 explicitly does NOT do

- **No new object store, no `DB_VERSION` bump, no migration** — the profile is a
  `preferences` JSON value. ADR-0026's stores (DB_VERSION 9) remain Phase 3/4.
- **No nutrition fetch / no `/api/nutrition`** — targets are pure local math only;
  USDA FDC enrichment is Phase 4.
- **No recipes, no weekly plan, no scoring** — the Recipes and Weekly Plan stubs in
  `EatRoute` stay as Phase-1 "coming soon" placeholders.
- **No full DRI panel** — curated micros only (fiber, sodium, calcium, iron,
  potassium, vitamin C, vitamin D); broader coverage is deferred.
- **No new dependency** — all math is hand-written; existing atoms/icons suffice. If
  a new dep seems needed, ask first (AGENTS.md).
- **No new ADR** — storage reuses the `preferences` precedent and theming reuses
  ADR-0028; nothing here contradicts or extends an accepted decision enough to need
  one. (Surface for review: confirm the reviewer agrees the profile-in-`preferences`
  choice doesn't warrant a record — if they want it documented, a short ADR is cheap.)

## Risks / things to watch

- **Targets correctness is the whole value.** A wrong BMR constant or DRI value ships
  silently-plausible numbers. Pin the math to hand-checked references in the test
  suite and cite sources in comments; this is the load-bearing review surface.
- **Unit round-trip drift.** Repeatedly toggling imperial↔metric must not erode the
  stored value — store metric-canonical and convert only at the display edge; test
  the round-trip explicitly.
- **Corrupt/legacy `preferences` blob.** The read hook must return `null` (and let the
  empty state show), never throw, if `JSON.parse` fails — a crashed Eat tab on a bad
  blob would be a hard failure.
- **Live recompute.** Targets must update immediately after a profile edit — verify the
  mutation invalidates the query key and the route recomputes (no memoized stale value).
- **Theme inheritance.** New surfaces must use role tokens only; a single hardcoded hex
  would break the green retheme under `/eat` (ADR-0028).
- **Stay schema-free.** It's tempting to "just add a profile store" — that would bump
  DB_VERSION and pull ADR-0017/0026 into scope. Resist; the decision is preferences-JSON.

## Open questions (resolved before planning — recorded for traceability)

- Profile storage → **`preferences` JSON blob** (no new store / DB bump). ✓
- Micro coverage → **curated subset** (fiber, sodium, calcium, iron, potassium, vit C,
  vit D). ✓
- Units → **imperial default + metric toggle**, metric-canonical storage. ✓

## Open questions to confirm while implementing

- **Macro-split policy** — protein `1.6 g/kg`, fat `30%`, carbs remainder is the
  proposed v1 default; confirm the user is happy or wants a different split (it's a
  one-line change and is documented as swappable).
- **Activity-level labels** — surface plain-language descriptions for the 5 levels
  ("Sedentary — little/no exercise" … "Very active — hard exercise 6–7×/wk") so the
  user can self-select accurately; confirm wording.
- **Edit affordance** — inline disclosure vs reusing the `BottomSheet` molecule for the
  form. Recommendation: `BottomSheet` (matches existing app patterns); confirm.
