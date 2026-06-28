# Active Task: Swipe-delete affordance + aisle-header UI fixes

Two cosmetic fixes to the in-motion shopping list (`ShoppingListBuilder`):

1. **Swipe-delete affordance** — the red destructive layer must only be visible
   while a swipe is in progress (or the fallback button is focused), and when
   revealed it should read as a full-width red delete area, not a cut-off 88px
   button chunk.
2. **Aisle headers** — drop the `bg-primary` number placard (it reads like a
   count) and label each numbered aisle inline as `Aisle N — Label`.

## Constraints / ADRs

- **ADR-0022 (aisle-placard signature)** is `Accepted` and its *Signature*
  section mandates the `bg-primary` number placard and a header text that
  *omits* the `Aisle N —` prefix. Fix #2 reverses exactly that. ADRs are
  immutable (AGENTS.md), so this requires a **new ADR-0023** that supersedes
  ADR-0022's signature section, plus the one permitted edit to ADR-0022's
  `Status` field.
- ADR-0022 also documents swipe-to-delete. Fix #1 is a *refinement* that better
  serves ADR-0022's stated goal ("stops a destructive control from sitting on
  every row") — the red currently bleeds around the rounded corners at rest.
  Not a contradiction; ADR-0023 will note it as a refinement of the same
  interaction.
- ADR-0005 (atomic design): changes stay within the existing `SwipeableRow` and
  `AisleGroup` molecules and the `ShoppingListBuilder` organism. No new
  components, no new deps, no token changes.
- `formatAisleLabel` is the single source of truth for labels and already emits
  `Aisle N — Label` (em dash). Keep the em dash; the user's "Aisle 1 - Cereal"
  is shorthand for the same format.

## Changes

### 1. `src/components/molecules/SwipeableRow.tsx`

- **Full-width red layer:** change the affordance container from
  `absolute inset-y-0 right-0` (a right-pinned `flex`) to a full-bleed
  `absolute inset-0` `bg-destructive` layer with the trash control right-aligned
  inside it (`flex items-center justify-end`). The red now spans the whole row
  beneath the foreground instead of an 88px slab.
- **Only show while swiping:** gate the red layer's visibility on the existing
  `open` state (`dx !== 0 || dragging`, which also becomes true on button focus
  via `onFocus={() => setDx(-REVEAL)}`). At rest `open` is false → no red.
  - Keep the `<button>` mounted at all times (it must stay focusable for
    keyboard/SR users, per ADR-0022); toggle only the *visible* red. Move
    `bg-destructive` onto the wrapper layer and drive its visibility with
    `open ? 'opacity-100' : 'opacity-0'` (with `motion-safe:transition-opacity`),
    so focusing the button (sets `open`) still reveals it. The button keeps its
    fixed `width: REVEAL` hit target and right-edge trash icon; the full-width
    red comes from the wrapper layer behind it.
- **Clip the corners:** apply `overflow-hidden` unconditionally on the `<li>`
  (drop the `open ?` condition) so no red can poke past the `rounded-xl` corners
  even mid-transition. This is what kills the "red around the right-side edges
  at rest" symptom together with the opacity gate.
- The trash icon stays right-aligned so the gesture still reads "swipe left to
  reveal delete."

### 2. `src/components/molecules/AisleGroup.tsx`

- Remove the `marker` prop and the entire `bg-primary` placard `<span>` branch.
- Keep the `done`-variant check chip (it is not a number badge).
- Header `<span>` becomes the only leading element for `aisle`/`muted` variants.

### 3. `src/components/organisms/ShoppingListBuilder.tsx`

- Drop the `isNumeric` split: pass `header={formatAisleLabel(aisle)}` for every
  bucket and remove the `marker={...}` prop. `formatAisleLabel` already yields
  `Aisle N — Label` for numbered aisles and the bare label for named sections.

### 4. ADRs

- **New `docs/adrs/0023-inline-aisle-headers.md`** (status `Accepted`):
  supersedes ADR-0022's *Signature — aisle placards* section only. Decision:
  drop the number placard (reads like a count) in favour of inline
  `Aisle N — Label` headers via `formatAisleLabel`; documents the swipe
  affordance refinement (red only while swiping, full-width reveal,
  unconditional corner clip). Palette/typography/elevation (ADR-0020) and the
  swipe-to-delete *decision* (ADR-0022) remain in force. Cite ADR-0005,
  ADR-0020, ADR-0022.
- **Edit `docs/adrs/0022-aisle-placard-signature.md`** `Status` only →
  `Superseded by ADR-0023 (signature only)`. No other edit to its body.

### 5. Tests

- `AisleGroup.test.tsx`: drop `marker` props; replace the "renders an aisle
  placard carrying the marker number" test with one asserting **no** `bg-primary`
  placard renders for a numbered aisle, and that the formatted header text shows.
  Keep the done-variant check-chip test.
- `SwipeableRow.test.tsx`: existing behavioural tests (threshold delete, snap
  back, tap suppression, accessible button, motion-safe) stay green. Add/adjust:
  the delete affordance is not visibly shown (opacity-0) at rest and is revealed
  (opacity-100 / `open`) once a horizontal drag begins or the button is focused.
  Keep the accessible-button-fires-onDelete test (button stays in the DOM).
- Add a `ShoppingListBuilder` assertion (or adjust existing) that a numbered
  aisle renders the `Aisle N — Label` header and no placard.

## Verification

- `npm run validate` (typecheck + lint + Vitest).
- `npm run test:e2e` — swipe/gesture and list-view E2E can break while `validate`
  passes (AGENTS.md). Run before calling done.
- Manual: at rest no red is visible on any row; swiping left reveals a full-width
  red area with a right-aligned trash icon; aisle headers read `Aisle N — Label`
  with no number badge.

## Commits (Conventional Commits)

- `docs: add ADR-0023 inline aisle headers, supersede ADR-0022 signature`
- `fix: reveal swipe-delete affordance only while swiping, full-width red`
- `refactor: replace aisle number placard with inline "Aisle N — Label" headers`

No `DB_VERSION` bump; no `package.json` change.
