---
step: 6
substep: 0
status: active
class: standard
e2e_required: true
clarifications: |
  Phase 6 is the Eat epic's hardening/polish/a11y/E2E pass — the final phase in
  `tasks/backlog--eat-tab.md`. It ships NO new feature surface, NO new schema, and
  NO new `/api/*` function. It closes the carry-forwards that earlier phases
  explicitly deferred to it (ADR-0028's "Phase 6 accessibility pass"; the backlog's
  offline/empty-state/E2E hardening line).

  Two scope decisions confirmed with the user (2026-06-30):
  - ACCESSIBILITY TOOLING: NO new dependency. Phase 6 does a MANUAL WCAG AA
    contrast audit of every Eat role-token pair + the ring tone colors, and hardens
    coverage with the existing Vitest/RTL + Playwright tooling only. An automated
    axe-core E2E scan is DEFERRED to a new backlog item ("Automated a11y (axe) scan
    in E2E"), not built here.
  - PWA CHROME: INCLUDE a route-driven `<meta name="theme-color">` swap so the
    browser/OS chrome bar greens on `/eat` and reverts to blue elsewhere — closing
    the gap that ADR-0028's in-DOM `data-theme` mechanism can't reach (the manifest
    `theme_color` is static `#084887`). This is a small new runtime mechanism →
    drafts a new ADR (0030; `0025` is a gap in the sequence — confirm the number at
    draft).

  Grounding facts established while planning (do not re-derive):
  - E2E runs against `npm run dev` (playwright.config.ts `webServer.command`), where
    the service worker is DISABLED (`vite.config.ts` → `VitePWA.devOptions.enabled:
    false`). Therefore a true SW-precache "assets offline" assertion is NOT possible
    in the E2E harness. The offline guarantees Phase 6 CAN assert in E2E are
    data-layer: API unreachable → cached nutrition still renders, unenriched recipe
    degrades (never throws), and IndexedDB state persists across reload. Full
    SW-precache offline is verified MANUALLY against `npm run build && npm run
    preview` and documented — not faked with an E2E that the harness can't run.
  - The existing eat specs (`eat-nutrition`, `eat-weekly-plan`) already use the
    `support/offlineModel` fixture (aborts the embedding-model fetch) and
    `route.abort('**/api/nutrition**')` to model data-offline. Phase 6 reuses that
    pattern; it does not invent a new offline harness.
  - `src/components/molecules/NutrientRing.tsx` ALREADY ships the ring a11y baseline
    (`role="img"`, computed `aria-label`, `motion-safe:` arc-fill, tone via role
    tokens). Phase 6 AUDITS and, where needed, EXTENDS this — it does not rebuild it.
  - `AppShell.tsx` already computes `const isEat = location.pathname.startsWith
    ('/eat')` (line ~20) and sets `data-theme`. The meta-color swap hangs off the
    SAME signal; no new route-watching logic.
  - `index.html` has NO `<meta name="theme-color">` today; one must be added for the
    runtime swap to have a tag to mutate.
---

# Phase 6: "Eat" Tab — Offline, Polish, Accessibility & E2E Hardening

## Relevant ADRs

- **ADR-0028** (Eat section-scoped green theme, *Accepted*) — THE ADR this phase
  closes out. Its Notes section explicitly defers two items to "the Phase 6
  accessibility pass": (1) the full **WCAG AA contrast re-verification on the green
  ramp** (Phase 1 verified three key pairs — `text-muted` on surface, `primary-
  foreground` on primary, accent on primary — but not the full Eat surface inventory
  nor the scoring-ring tones, which did not exist yet), and (2) confirming
  **reduced-motion** across the scoring visualization. Phase 6 fulfills both. It does
  NOT edit ADR-0028 (immutable once accepted) — the contrast numbers it produces are
  recorded in this plan and the `index.css` comment, and the new meta-theme-color
  mechanism (which ADR-0028's in-DOM `data-theme` cannot reach) is captured in a NEW
  ADR (0030), not by amending 0028.
- **ADR-0001 / ADR-0002** (single-repo / IndexedDB offline-first) — the offline
  guarantee Phase 6 verifies. Everything in Eat except Phase 4 enrichment computes
  from persisted IndexedDB data; Phase 6 proves the planned-week + scoring + recipe
  surfaces render and persist with the network unreachable, and that the ONE
  networked step (enrichment) degrades to a clear "needs connection" state rather
  than throwing.
- **ADR-0014** (PWA versioning & update strategy) / **ADR-0010** (Cloudflare CI/CD) —
  context for the SW precache that delivers true asset-offline. Phase 6 touches
  neither the SW (`src/sw.ts`) nor the update flow; it only ADDS a `<meta
  name="theme-color">` to `index.html` and mutates its `content` at runtime. The
  install-time manifest `theme_color` (`vite.config.ts`) is left unchanged — confirm
  this division (manifest = install icon/splash color; meta tag = live chrome) in
  ADR-0030.
- **ADR-0018** (reinstate E2E gate in pipeline) — Phase 6 is `e2e_required: true`;
  `npm run validate` alone is explicitly insufficient (AGENTS.md). The E2E additions
  here are the deliverable's backbone, and `npm run test:e2e` must be green.
- **ADR-0005** (atomic design) — any polish edits stay within the existing
  atom/molecule/organism boundaries. Empty/error/loading-state fixes live in the
  component that already owns that surface; no new cross-cutting layer.
- **ADR-0029** (Eat weekly-plan model & scoring) / **ADR-0027** (nutrition source) /
  **ADR-0026** (Eat data model) — consumed unchanged. Phase 6 adds no store, no
  scoring rule, no network surface.

**New ADR drafted this phase:** **ADR-0030 — Route-driven `<meta name="theme-color">`
for the Eat sub-theme.** Records the decision to swap the live browser/OS chrome
color off the active route (green on `/eat`, the blue manifest value elsewhere),
why this lives in a runtime effect rather than the static manifest (the manifest
`theme_color` is a single install-time value and cannot be route-scoped), and that
it complements — does not replace — ADR-0028's in-DOM `data-theme` cascade. Present
for approval before saving. (Use the next free number; `0025` is a gap and `0030` is
the next monotonic — confirm at draft, mirroring the Phase 5 / ADR-0029 choice.)

## Goal

Make the Eat tab production-solid, not just feature-complete. Phase 6 takes the
surfaces shipped in Phases 1–5 and (a) proves they work offline end-to-end with a
clear "connect to enrich" story for nutrition misses, (b) audits and fills the
empty / loading / error states across every Eat screen, (c) completes the WCAG AA
contrast + reduced-motion accessibility pass on the green ramp and the scoring
rings that ADR-0028 deferred to this phase, (d) greens the live browser chrome bar
on `/eat` via a route-driven meta theme-color, and (e) hardens the Playwright suite
so the whole Eat journey — tab + theme switch, profile→targets, save recipe,
enrich, build a week, score — is covered and the E2E gate (ADR-0018) protects it.
No new feature, no schema change, no new network surface.

## Key reuse (do NOT rebuild)

- **`support/offlineModel` fixture + `route.abort('**/api/nutrition**')`** — the
  established E2E offline model. New offline assertions extend it; no new harness.
- **`NutrientRing` a11y baseline** (`role="img"`, `aria-label`, `motion-safe:`) —
  audit/extend, don't rewrite.
- **`AppShell` `isEat` signal** — the meta-color effect reads it; no new route watch.
- **Existing Eat empty-state patterns** — `EatRoute`'s no-profile CTA card,
  `WeeklyPlan`'s empty-plan / no-profile / unenriched states, `RecipeNutrition`'s
  "Couldn't connect to enrich" offline state, `RecipeLibrary`'s empty state. The
  audit standardizes copy/structure against these; it does not introduce a new
  empty-state component unless a gap has no existing pattern to follow.
- **`index.css` `[data-theme='eat']` block** — the single place green tokens live;
  any contrast fix edits a token value here (with the measured ratio in the comment),
  never a hardcoded hex in a component.

## Exit Criteria

### A. Accessibility pass (closes ADR-0028's deferral)

- **Full Eat contrast inventory (manual, documented):** enumerate every
  foreground/background role-token pair actually rendered under `data-theme="eat"`
  across ALL Eat surfaces — `EatRoute`, `DailyTargets`/`TargetReadout`,
  `RecipeLibrary`/`RecipeCard`, `RecipeDetailRoute`/`RecipeNutrition`/
  `RecipeIngredientRow`, `RecipeFormRoute`/`RecipeForm`, `ImportRecipeRoute`/
  `RecipeImporter`/`ImportTargetPicker`, `WeeklyPlan`/`DayColumn`/`ScorePanel`/
  `NutrientRing`/`AddToPlanSheet`, and the chrome (`StoreHeader`, bottom nav) — and
  record the measured ratio for each. Body text/icons must clear **AA 4.5:1** (≥3:1
  for ≥24px/bold large text and for non-text UI indicators per 1.4.11). Any pair
  that fails is fixed by nudging the token in the `index.css` Eat block, and the new
  ratio is recorded in that block's comment (extending the table Phase 1 started).
- **Scoring-ring tone audit:** the under / on / over tone classes
  (`NutrientRing` `TONE_CLASS`) are verified for (1) ≥3:1 of the arc against its
  track and against the card background (1.4.11 non-text contrast), and (2) that
  status is NEVER color-only — every ring already pairs color with the text percent,
  `value / target`, and `aria-label`; the audit confirms this holds for all three
  tones and at 0% / partial / >100% (an over-target ring must not visually read as
  "complete/good" without its text). Fix tokens if any tone fails.
- **Reduced-motion sweep:** confirm every Eat animation is `motion-safe:`-gated —
  the `NutrientRing` arc-fill (already), plus any `ScorePanel` reveal, `BottomSheet`/
  `AddToPlanSheet`/`FoodPickerSheet` slide transitions, and the `DailyTargets`/score
  transitions. Anything animating unconditionally is gated. A `NutrientRing` test
  already asserts the `motion-safe:` class; add equivalent assertions where a sheet
  or panel animation is found ungated.
- **Keyboard + semantics spot-check:** bottom sheets (`AddToPlanSheet`,
  `FoodPickerSheet`, the profile/edit sheet) are reachable and dismissible by
  keyboard, focus is sensibly placed on open and restored on close, and each Eat
  screen has a coherent heading order (one `h1` per route, sections as `h2`). Fix
  any gap found (focus trap / `aria-label` / heading level) in the owning component.

### B. Offline & state hardening

- **Offline verification (data-layer, E2E-asserted):** with the embedding model
  aborted (offlineModel fixture) AND `**/api/nutrition**` aborted: a previously
  enriched, planned week renders its scores; reload keeps the plan + scores (IndexedDB
  persistence); a planned recipe with an unenriched ingredient shows a PARTIAL score
  and the "enrich to score" affordance and never throws; the recipe-detail nutrition
  surface shows its "Couldn't connect to enrich" state on an enrich attempt with the
  API down. (Extends the existing `eat-weekly-plan` / `eat-nutrition` specs.)
- **Offline verification (SW asset-offline, MANUAL + documented):** because E2E runs
  against `npm run dev` with the SW disabled, the true asset-offline guarantee is
  verified by hand against `npm run build && npm run preview`: install/load once
  online, go offline (DevTools / airplane mode), reload `/eat` and navigate the Eat
  surfaces — the shell, recipes, and a scored week all render from precache +
  IndexedDB. Steps + result recorded in this plan's verification log. (Honest scope:
  not E2E-gated; the harness can't run it.)
- **Empty / loading / error-state audit:** walk every Eat screen in each state and
  confirm a deliberate, themed, accessible treatment exists (not a blank flash, a
  raw spinner with no label, or an all-zero score that reads as "target met"):
  - Profile: loading (no flash of empty CTA), no-profile CTA, populated summary.
  - RecipeLibrary: loading, empty (CTA to import/add), populated.
  - RecipeDetail / RecipeNutrition: loading, enriched, partial, unenriched, offline
    ("needs connection"), per-row match status.
  - WeeklyPlan: loading, no-profile (score needs targets), empty-plan (an unplanned
    week must show "add a recipe to a day", NOT all-zero "under" rings — already a
    Phase 5 guard; re-confirm), populated, partial (unenriched) day.
  - Import path: in-flight, parse-error, success → "save as recipe".
  Any missing/inconsistent state is filled using the existing pattern for that
  surface. Net-new components only if no pattern exists to extend.

### C. PWA live chrome color (route-driven meta theme-color)

- **`index.html`:** add `<meta name="theme-color" content="#084887" />` (the current
  blue manifest value) as the baseline tag.
- **Runtime swap:** a tiny effect driven by the existing `AppShell` `isEat` signal
  sets the meta tag's `content` to the green chrome value on `/eat` and back to the
  blue baseline elsewhere — mirroring the `data-theme` toggle so the live browser/OS
  chrome bar matches the in-app theme. The green value matches the rendered Eat
  chrome (`--color-primary` `#1b7a43`, or `--color-ink` if that's what the app-bar
  paints — pick to match the actual `StoreHeader` background, verified visually). No
  change to `vite.config.ts`'s install-time manifest `theme_color`.
- **Tests:** a unit/component test asserts the meta tag's `content` flips when the
  route enters/leaves `/eat`; an E2E assertion reads `meta[name=theme-color]` on a
  Shop↔Eat navigation.

### D. E2E hardening (ADR-0018)

- **Tab + theme switch:** an E2E that navigates Shop → Eat and asserts the shell
  carries `data-theme="eat"` (and reverts), the bottom-nav active state, AND the
  `meta[name=theme-color]` swap (folds in C). The existing `navigation.spec.ts` is
  the home for the nav/theme assertion if it fits; otherwise a focused `eat-theme`
  spec.
- **Journey coverage review:** confirm the existing eat specs (`eat-profile`,
  `eat-recipes`, `eat-nutrition`, `eat-weekly-plan`) collectively cover
  profile→targets, save-recipe, enrich (mocked), build-a-week, and scoring. Fill any
  gap found (e.g. an explicit profile→DailyTargets render assertion if absent) rather
  than duplicating. Keep specs using the shared IDB-reset/import helpers.
- **Green suite:** `npm run test:e2e` passes headless; flaky waits replaced with
  deterministic locators where the audit surfaces them.

### E. Validate, docs, ship

- `npm run validate` clean (typecheck + lint + Vitest); `npm run test:e2e` green;
  `npm run build` succeeds; `npm run format:check` clean.
- **ADR-0030** drafted (route-driven meta theme-color) and approved before save.
- **Backlog item added:** "Automated a11y (axe) scan in E2E" — capture the deferred
  `@axe-core/playwright` automated-scan idea as a one-line backlog entry in `PLAN.md`
  (and/or `tasks/backlog--*`), so the manual audit done here has a documented
  automated successor.
- **`PLAN.md`:** move Phase 6 from Active to a Current-Status "complete" line
  summarizing the hardening; mark the Eat epic complete (all six phases shipped) and
  drop the epic from Backlog. Rename this file to
  `tasks/complete--eat-tab-phase-6.md`.
- **Commit (Conventional Commits).** Most of the diff is tests + a11y/state polish +
  the meta-color mechanism. Subject reflects the dominant change, e.g.
  `feat: green the browser chrome on Eat and harden Eat offline/a11y/E2E` (the
  meta-color swap is a user-visible feature; if the final diff is purely
  test/polish with no behavior change, downgrade to `fix:`/`test:` accordingly).
  Decide the type from the actual diff at commit time. **NO `DB_VERSION` bump, NO
  `package.json` change** (confirm — the axe dep was explicitly deferred), NO `.env`
  change, NO new `/api/*`. Push to `claude/eat-tab-phase-6-plan-defs47`.

## Implementation Steps

### Part 0 — Audit & inventory (no code yet)
- [ ] Walk every Eat surface and build the contrast inventory table (token pair →
  measured ratio → pass/fail) and the empty/loading/error-state matrix. This is the
  worklist that drives Parts 1–3; capture it in this file's "Audit findings" section.

### Part 1 — Accessibility fixes (Exit A)
- [ ] Apply any contrast fixes to the `index.css` `[data-theme='eat']` tokens,
  recording new ratios in the comment block. Re-check dependent pairs after each nudge.
- [ ] Gate any ungated Eat animation behind `motion-safe:`; add the missing
  reduced-motion assertions (sheet/panel) alongside the existing `NutrientRing` one.
- [ ] Fix any keyboard/focus/heading-order gap in the owning sheet/route component;
  add a focused test where a real defect was fixed.

### Part 2 — Offline & state hardening (Exit B)
- [ ] Fill any missing empty/loading/error state per the Part 0 matrix, reusing the
  established per-surface pattern. Add/extend component tests for the filled states.
- [ ] Manual SW asset-offline pass against `build && preview`; record steps + result
  in the verification log below.

### Part 3 — Live chrome color (Exit C, drafts ADR-0030)
- [ ] Add the baseline `<meta name="theme-color">` to `index.html`.
- [ ] Add the `isEat`-driven content swap in `AppShell` (or a tiny `useThemeColor`
  hook it calls); match the green value to the rendered chrome.
- [ ] Unit/component test for the swap on route change.
- [ ] Draft ADR-0030; present for approval.

### Part 4 — E2E hardening (Exit D)
- [ ] Add the tab+theme+meta-color switch assertion (in `navigation.spec.ts` or a new
  `eat-theme.spec.ts`).
- [ ] Extend `eat-weekly-plan` / `eat-nutrition` with the data-offline + reload-
  persistence + partial-degradation assertions from Exit B.
- [ ] Review journey coverage; fill the smallest gap found; de-flake as surfaced.

### Part 5 — Validate, docs, ship (Exit E)
- [ ] `npm run validate`, `npm run test:e2e`, `npm run build`, `npm run format:check`.
- [ ] Add the "Automated a11y (axe) scan in E2E" backlog entry.
- [ ] Update `PLAN.md` (Phase 6 complete; Eat epic done); rename this file to
  `tasks/complete--eat-tab-phase-6.md`.
- [ ] Confirm NO `DB_VERSION` / `package.json` / `.env` / `/api` change.
- [ ] Commit (Conventional Commits; type from the actual diff) + push.

## What Phase 6 explicitly does NOT do
- **No new feature surface, no new schema, no migration** — `DB_VERSION` unchanged;
  no new store, no store-shape change.
- **No new network surface** — no new `/api/*` function, no new env var. Enrichment
  (Phase 4) is reused unchanged.
- **No new dependency** — the automated axe-core scan is DEFERRED to a backlog item;
  Phase 6 audits manually and tests with the tooling already in the repo. (AGENTS.md:
  ask before any `package.json` change — none is taken here.)
- **No SW / update-flow change** — `src/sw.ts` and the PwaUpdate flow are untouched;
  only a `<meta>` tag and its runtime `content` are added. The install-time manifest
  `theme_color` stays blue.
- **No edit to accepted ADRs** — ADR-0028 is immutable; the new meta-color mechanism
  is ADR-0030, and contrast results are recorded in `index.css` + this plan.
- **No change to Shop / import / list critical paths** — offline check-off, lists,
  default list, recipe import all byte-for-byte intact.

## Risks / things to watch
- **E2E can't prove asset-offline.** The harness runs `npm run dev` (SW off), so the
  "works with no network at all" guarantee is MANUAL against `preview`. Don't write
  an E2E that claims SW-offline coverage it can't actually exercise — assert the
  data-layer offline behavior in E2E and document the SW pass by hand. (Surfaced so a
  reviewer doesn't expect a green E2E to cover precache.)
- **Contrast fixes cascade.** The Eat tokens are shared across all Eat chrome + body;
  nudging `--color-primary` to fix one pair can regress `--color-accent` on it (the
  deliberate low-ratio "spark") or the nav. Re-measure every dependent pair after any
  token change, not just the one being fixed.
- **Over-target rings reading as "good."** An energy/sodium ring at >100% must not
  visually imply success via a full/green arc alone — the text percent + status +
  per-nutrient direction (from Phase 5's `scoreTotals`) carry the meaning; the audit
  must confirm this at >100%, not only at ≤100%.
- **Meta theme-color value drift.** The green meta value must match what the chrome
  ACTUALLY paints (`StoreHeader` background), or the OS bar and the in-app bar will be
  two different greens. Pick the value by inspecting the rendered chrome, not by
  guessing a token name.
- **Don't gold-plate the polish.** The empty/error-state audit should standardize and
  fill genuine gaps, not churn every working state. Reuse the existing per-surface
  pattern; net-new components only where no pattern exists.
- **Conventional-commit type.** If the meta-color swap is the only behavior change,
  `feat:` is correct; if the final diff is purely tests/a11y token tweaks with no
  user-visible behavior change, use `fix:`/`test:`. Pick from the real diff so
  semantic-release versions correctly (AGENTS.md / ADR-0017).

## Open questions to confirm before / during coding
(Defaults assumed per the frontmatter `clarifications`; confirm or override.)
- **a11y tooling** — manual audit + existing tooling, axe scan deferred to backlog
  (confirmed 2026-06-30).
- **PWA chrome** — include the route-driven meta theme-color swap (confirmed
  2026-06-30); ADR-0030 to be approved at draft.
- **ADR number** — `0030` (next monotonic; `0025` is a gap) — confirm at draft.
- **Commit type** — decided from the final diff (feat if meta-color ships as the
  behavior change; otherwise fix/test).

## Audit findings
(Filled during Part 0 — contrast inventory table + empty/loading/error-state matrix.)

## Verification log
(Filled at ship — manual SW asset-offline steps/result; validate/e2e/build outcomes.)
