---
epic: eat-tab
phase: 1
status: planning
class: standard
e2e_required: true
clarifications: |
  Phase 1 of the "Eat" tab epic (`tasks/backlog--eat-tab.md`). This is the
  shell/theme phase: it adds the third primary tab, the `/eat` route, the
  section-scoped green sub-theme, and an empty Eat landing screen — so navigation
  and theming can be reviewed before any data features (profile, recipes,
  enrichment, planning) land in Phases 2–5.

  Decisions already locked and ratified in Phase 0:
  - ADR-0028 (Accepted) fixes the theming MECHANISM: a `[data-theme='eat']`
    custom-property override block in `src/index.css`, activated by a
    `data-theme="eat"` attribute on the AppShell root, driven by the active
    route. Phase 1 implements that mechanism and chooses the final green hexes.
  - ADR-0026 (Accepted) designs the Eat object stores but the migration ships in
    Phase 3/4. **Phase 1 ships NO schema/DB code and does NOT bump DB_VERSION.**
  - ADR-0020 remains the in-force blue identity everywhere outside `/eat`.

  Because the profile/recipes/plan object stores do not exist until Phases 2–5,
  the "state-aware" landing (no profile / no recipes / no plan) the backlog
  describes is only PARTIALLY achievable now: Phase 1 ships a static empty
  landing whose sections are stubbed placeholders, structured so later phases
  swap each stub for a real data-driven state. This is called out below as a
  deliberate scope boundary, not an omission.
---

# Phase 1: "Eat" Tab — Shell + Scoped Green Theme + Empty Landing

## Relevant ADRs

- **ADR-0028** (section-scoped green theme, *Accepted*) — the load-bearing ADR for
  this phase. It fixes the mechanism (`data-theme="eat"` on the shell root +
  `[data-theme='eat']` token overrides in `src/index.css`, route-driven) and
  explicitly defers the **final green hex selection + WCAG AA contrast audit** to
  "Phase 1 implementation." Implement exactly that mechanism; do not invent a
  React/JS palette-swap path (rejected in the ADR).
- **ADR-0020** (monochrome-blue identity, in force) — the default `@theme` palette
  stays blue; the green block must only *override* the hue-carrying tokens for
  `[data-theme='eat']` descendants and leave the blue `@theme` defaults untouched.
- **ADR-0008** (superseded by 0020) — precedent that the `@theme` CSS-custom-property
  *mechanism* supports swapping palettes without touching components; reuse it,
  don't fork it.
- **ADR-0012** (shop-as-root redirect / navigation architecture) — the nav lives in
  `AppShell`; adding a `NAV_ITEM` + child route is the sanctioned extension point.
  Confirm the new `/eat` route does not disturb the `/`→`/lists/:id` redirect.
- **ADR-0026** (Eat data model, *Accepted*) — constrains LATER phases. Cited here
  only to assert the boundary: **Phase 1 touches no object store, no
  `schema.ts`, no `idbClient.ts`, and does not bump `DB_VERSION`.**

## Goal

Add a third primary tab — **Eat** — with its own `/eat` route and a green
sub-theme that applies (chrome included) only while inside Eat and reverts to
blue on leaving, plus a reviewable empty landing screen. This is the visible
skeleton Phases 2–5 hang features on; it ships no persistence and no nutrition
logic.

## Exit Criteria

- A third bottom-nav item **Eat** renders between Shop and Settings, with an `/eat`
  route mounted under `AppShell`.
- Navigating into `/eat` applies the green sub-theme to the **entire shell** — the
  bottom nav, the `StoreHeader`, and the page body — and leaving `/eat` reverts to
  blue, with no global state and no flash.
- Final green token ramp chosen and committed in `src/index.css` under
  `[data-theme='eat']`, with WCAG AA contrast verified on the key pairs
  (`--color-text-muted` on surface ≥ 4.5:1; nav active `--color-accent` on the
  green nav bar documented; `--color-primary-foreground` on green chrome).
- An empty Eat landing screen renders state-aware placeholder sections
  (intro + "coming soon" stubs for Profile / Recipes / Weekly Plan), structured so
  Phases 2–5 replace each stub in place.
- Unit tests updated/added (AppShell nav count + Eat active state + theme attribute;
  `EatRoute` smoke render). `npm run validate` clean.
- E2E updated/added: Eat tab present, navigates, activates, and the shell carries
  `data-theme="eat"` under `/eat` and not elsewhere. `npm run test:e2e` green.
- No `DB_VERSION` change; no `schema.ts`/`idbClient.ts` diff.

---

## Implementation Steps

### Part 1 — Nav item + route wiring

- [ ] **`src/components/templates/AppShell.tsx`**
  - Import a food icon from `@fortawesome/free-solid-svg-icons` (`faUtensils` is
    present in the installed package; `faBowlFood`/`faLeaf`/`faAppleWhole` are
    alternatives — pick `faUtensils` unless the user prefers another).
  - Add `{ to: '/eat', end: false, icon: faUtensils, label: 'Eat' }` to
    `NAV_ITEMS` (order: Shop, Eat, Settings).
  - The existing `NavLink isActive` logic already handles `/eat` activation
    (`end: false` → active for `/eat` and any future `/eat/*`). Confirm Shop
    (`to: '/'`, `end: true`) is **not** active on `/eat`, and that the
    `isOnListDetail`/`isOnStoreDetail` special-cases don't bleed onto Eat.
- [ ] **`src/App.tsx`** — add `{ path: 'eat', element: <EatRoute /> }` to the
  `AppShell` children, importing `EatRoute` from `@/routes/EatRoute` (path alias,
  no relative import). Verify the `/`→`/lists/:id` index redirect (ADR-0012) is
  unaffected.

### Part 2 — Section-scoped green theme (ADR-0028 mechanism)

- [ ] **`src/components/templates/AppShell.tsx`** — the component already calls
  `useLocation()`. Add:
  ```tsx
  const isEat = location.pathname.startsWith('/eat');
  ```
  and set the attribute on the shell root (the common ancestor of `StoreHeader`,
  `<Outlet>`, and the bottom `nav`):
  ```tsx
  <div data-theme={isEat ? 'eat' : undefined} className="flex flex-col h-svh">
  ```
  Using `undefined` (not `false`/`''`) so the attribute is fully absent off-Eat
  and the default blue `@theme` applies.
- [ ] **`src/index.css`** — after the `@theme` block, add a plain
  `[data-theme='eat'] { … }` rule overriding only the hue-carrying tokens. Default
  `@theme` blue is untouched. Proposed starting ramp (mirrors the ADR-0020 token
  roles; **treat hexes as provisional pending the contrast check in Part 3**):
  ```css
  [data-theme='eat'] {
    --color-ink: #0B3D24;                 /* deepest green: display headings */
    --color-primary: #1B7A43;             /* green chrome: app bar, nav, FAB */
    --color-primary-foreground: #EAF7EE;  /* text/icons on green */
    --color-accent: #6FD89A;              /* bright spark: active nav */
    --color-tint: #D6F0E0;                /* tonal surface tint */
    --color-surface: #EEF7F1;             /* page background */
    --color-background: #EEF7F1;
    --color-card: #FFFFFF;                /* unchanged, kept for clarity */
    --color-text: #0E1F16;
    --color-text-muted: #4A6555;          /* must verify ≥4.5:1 on surface */
    --color-border: #C2E6D0;
    /* elevation re-tinted green to match elevation-as-accent (ADR-0020) */
    --shadow-card: 0 1px 2px rgb(11 61 36 / 0.08);
    --shadow-raised: 0 2px 8px rgb(11 61 36 / 0.12);
    --shadow-float: 0 8px 24px rgb(11 61 36 / 0.18);
    /* --color-destructive intentionally NOT re-tinted (error red is global). */
  }
  ```
  - **Tailwind v4 note:** `@theme` emits these as `:root` custom properties and
    utilities (`bg-primary`, `text-accent`, `shadow-raised`, …) compile to
    `var(--color-…)`. A descendant `[data-theme='eat']` redefinition wins by
    cascade proximity for everything under the shell root — this is the supported
    v4 runtime-theming path and needs zero component changes. Verify the override
    actually takes (DevTools computed value) since `:root` and `[data-theme]`
    share specificity and proximity is what decides it.

### Part 3 — Green ramp contrast audit (ADR-0028 deferred item)

- [ ] Verify WCAG AA on the green ramp and adjust hexes until they pass / are
  documented:
  - `--color-text-muted` on `--color-surface` ≥ 4.5:1 (body text rule, as the blue
    `#51617E` satisfies today).
  - `--color-primary-foreground` on `--color-primary` (header/nav label legibility).
  - `--color-accent` on `--color-primary` for the active-nav state: document the
    measured ratio. The blue accent (`#6FA8FF` on `#0B4DA2`) is itself a low-ratio
    "spark"; match that intent but record the number rather than silently shipping
    worse contrast. The active nav also has a `bg-accent/15` tint backing the text.
  - Record the final ratios in the PR description / a short note; the full a11y
    sweep is Phase 6, but the tokens chosen here must not regress AA on body text.

### Part 4 — Empty Eat landing screen

- [ ] **`src/routes/EatRoute.tsx`** (new) — a presentational landing mirroring the
  `SettingsRoute` section layout (`px-4 pt-6`, `font-display` section headers,
  `text-text-muted` body), with NO store/hook access (those stores don't exist
  yet). Sections:
  - A heading/intro establishing the tab ("Plan your week" / nutrition-against-
    targets one-liner).
  - Three stubbed, clearly-"coming soon" placeholder sections — **Profile**,
    **Recipes**, **Weekly Plan** — each a muted empty card. Structure them so
    Phase 2 (profile/targets), Phase 3 (recipe library), and Phase 5 (plan grid)
    can replace the stub body in place without restructuring the page.
  - No FAB, no actions that route to unbuilt screens (avoid dead links).
  - **Scope note:** true data-driven "no profile / no recipes / no plan" states
    require the Phase 2–5 stores; Phase 1 ships static stubs only. This is the
    deliberate boundary, recorded so a reviewer doesn't read it as missing work.
- [ ] Decide the `StoreHeader` on `/eat`: per the epic, chrome **rethemes** (stays
  visible, turns green via the cascade) — keep it as-is for Phase 1; an
  Eat-specific header/title is a later-phase consideration, not Phase 1 scope.
  Note this explicitly so the green-store-name chrome isn't mistaken for a bug.

### Part 5 — Unit tests

- [ ] **`src/components/templates/__tests__/AppShell.test.tsx`** (update — currently
  asserts "exactly 2 nav links"):
  - Update the count assertion to 3 (Shop, Eat, Settings).
  - Add: Eat link active on `/eat`; Shop/Settings not active on `/eat`.
  - Add: shell root has `data-theme="eat"` on `/eat` and the attribute is absent on
    `/` and `/settings`. (Query the shell root container; assert the attribute via
    `toHaveAttribute`/`not.toHaveAttribute`.)
  - Register a stub `eat` child route in the test router's children so navigation
    resolves.
- [ ] **`src/routes/__tests__/EatRoute.test.tsx`** (new) — smoke render: the three
  placeholder section headings appear; no crash with no providers beyond what the
  static screen needs.

### Part 6 — E2E

- [ ] **`e2e/navigation.spec.ts`** (extend) — mirror the existing Shop/Settings
  cases for Eat: Eat tab visible; clicking it navigates to `/eat` and activates the
  tab (`text-accent`); leaving Eat de-activates it; direct nav to `/eat` highlights
  Eat. Update the "exactly N tabs" expectations if any assert a hard count.
- [ ] Add a theme assertion (new spec `e2e/eat-tab.spec.ts` or within
  `navigation.spec.ts`): on `/eat` the shell root has `data-theme="eat"`; on `/`
  and `/settings` it does not. (Locate the shell root via a stable selector — the
  outermost `div.flex.flex-col.h-svh` — or add a `data-testid` if needed for a
  robust handle.)

### Part 7 — Validate, document, ship

- [ ] `npm run validate` (typecheck + lint + Vitest) clean.
- [ ] `npm run test:e2e` green (Playwright — `validate` does not cover it;
  `e2e_required: true`).
- [ ] Confirm the diff has **no** `src/db/**` change and **no** `DB_VERSION` change.
- [ ] `PLAN.md` — update "Current Status" to Phase 1 (active), referencing this
  file; remove the Phase 0 line if Phase 0 is now complete (rename its task file to
  `complete--eat-tab-phase-0.md` per the AGENTS.md task-completion convention).
- [ ] Commit with Conventional Commits. The product code (nav item, route, theme,
  landing) is a user-facing feature with no schema change → **`feat:`** is correct
  here (e.g. `feat: add Eat tab shell with section-scoped green theme`). No
  `DB_VERSION` bump means no migration-gate concern (ADR-0017). Push to
  `claude/eat-tab-phase-1-plan-r02ixx`.

---

## What Phase 1 explicitly does NOT do

- No object stores, no `schema.ts`/`idbClient.ts` change, **no `DB_VERSION` bump**
  (Phase 3/4 per ADR-0026).
- No profile capture, no targets math, no recipe persistence, no `/api/nutrition`
  function, no weekly plan or scoring (Phases 2–5).
- No real data-driven landing states — only static "coming soon" stubs.
- No `package.json` change (the FA icon is already available via the installed
  `@fortawesome/free-solid-svg-icons`). If any new dep is somehow needed, ask first
  (AGENTS.md).
- No new ADR (ADR-0028 already governs the theming mechanism; Phase 1 only
  *implements* it and fills in the hexes it deferred).

## Risks / things to watch

- **Cascade specificity:** `:root` (from `@theme`) and `[data-theme='eat']` have
  equal specificity; the override works by proximity (the attribute is on a
  descendant of `:root`). Verify in DevTools that `bg-primary` etc. actually pick
  up the green under `/eat`. If a token is defined inline on `:root` only and not
  re-read, it won't retheme — check the chrome (`StoreHeader`, nav) specifically.
- **Chrome outside the Outlet:** the whole point of putting `data-theme` on the
  shell root (not a route wrapper) is that `StoreHeader` and the bottom `nav`
  retheme. Explicitly eyeball both on `/eat`.
- **Theme flash on navigation:** the attribute is route-driven via `useLocation`,
  so it flips synchronously with the route render — confirm no blue→green flash.
- **Test count assertions:** both the unit `AppShell.test.tsx` and possibly the
  e2e `navigation.spec.ts` encode the old 2-tab world; update them deliberately,
  don't just append.

## Open questions to confirm before/while implementing

- **Eat nav icon** — `faUtensils` proposed; confirm the user is happy with it vs
  `faBowlFood` / `faLeaf` / `faAppleWhole`.
- **Final green hexes** — the ramp above is a starting point; the user may have a
  preferred green. The contrast audit (Part 3) may shift them regardless.
- **`StoreHeader` on `/eat`** — keep the (rethemed-green) store header for Phase 1,
  or hide/replace it with an Eat-specific title now? Recommendation: keep it this
  phase (matches the epic's "chrome rethemes" verification goal); revisit when the
  Eat content gives it a reason to differ.
