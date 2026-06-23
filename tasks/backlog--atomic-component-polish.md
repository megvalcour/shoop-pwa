# Task: Atomic component polish — Button, Badge, Icon, GroceryListItem

## Problem

A cluster of smaller atom/molecule issues that hurt readability and reusability
and carry one latent footgun. Grouped into one task because each is small and
they share the same goal: tighten the presentational primitives so the
higher-level refactors sit on a clean base.

### 1. `Button` has no default `type` (latent footgun)

`src/components/atoms/Button.tsx` never sets `type`, so any `Button` rendered
inside a `<form>` defaults to `type="submit"`. Today the destructive/delete
buttons happen to sit *outside* their forms, so it's latent rather than live —
but it will bite the moment a non-submit button lands inside a form. `Badge`
already does the right thing (`type="button"` at `Badge.tsx:19`).

### 2. `Button` variants conflate intent with shape

`Button.tsx:7-16` mixes two axes in one `variant` enum:
- full-size semantic actions: `primary`, `secondary`, `danger`
- `p-1` icon affordances: `ghost`, `destructive`

`destructive` (an icon button, e.g. the trash) vs `danger` (a solid full-size
button, e.g. a dialog's Delete confirm) is genuinely confusing to read at call
sites. Intent (color/role) and shape (icon vs full button) are independent and
should not masquerade as sibling color variants.

### 3. No `Icon` atom despite ADR-0005 / ADR-0007

`FontAwesomeIcon` is imported directly in ~8 components. ADR-0005 lists `Icon` as
an atom and ADR-0007 commits to Font Awesome Free. A thin `Icon` wrapper
centralizes default sizing and makes a future icon-set change a one-file edit.

### 4. `GroceryListItem` is overloaded (11 props) and owns its picker

`src/components/molecules/GroceryListItem.tsx` is used two very different ways:
`DefaultListEditor` passes only `name`/`quantity`/`onDelete`, while
`ShoppingListBuilder` uses the full aisle/toggle/picker surface. It also owns
`sheetOpen` state and renders `AislePickerSheet` itself (`:34, :97-104`), so the
row can't be tested without the picker. This is the molecule most at risk of the
functionality/presentation blur.

## Relevant ADRs

- **ADR-0005 (atomic design):** atoms have no business logic; the `Icon` atom and
  the cleaner `Button` axes reinforce that. Splitting `GroceryListItem` into a
  presentational row + a thin aisle-aware wrapper keeps presentation and
  interaction-orchestration separable.
- **ADR-0007 (Font Awesome Free for icons):** the `Icon` atom is the single place
  that depends on `@fortawesome/*`, honoring the "centralize the icon decision"
  intent.
- **ADR-0008 (design tokens):** any `Button` variant reshuffle reuses existing
  token classes; no new colors.

No ADR is contradicted. The `Button` variant change is **API-affecting** —
touching it means a sweep of call sites; do it deliberately. **No new ADR
required**, but if the `Button` API changes meaningfully, note the new
intent/shape contract in the PR description.

## Approach

Each sub-item can ship independently; sequence as listed.

### 1. Default `Button` `type="button"`

- In `Button.tsx`, default `type` to `'button'` unless the caller overrides it
  (`type = 'button'` in the destructured props; callers passing `type="submit"`
  still win). Audit the two Add buttons — they already pass `type="submit"`, so
  they're unaffected.

### 2. Separate intent from shape on `Button`

- Recommended: introduce a `size`/`shape` axis (e.g. `icon` vs `default`) and let
  `variant` carry only intent (`primary | secondary | ghost | danger`). Map the
  old `destructive` (icon + destructive color) to `variant="danger" shape="icon"`
  (or `variant="ghost"` with a destructive token) and old `ghost` to
  `shape="icon"`.
- This is a call-site sweep (`GroceryListItem`, `ShoppingListCard`,
  `AislePickerSheet`, `StoreSwitcherSheet`, `ConfirmDialog`, `NewListSheet`,
  `AppVersionPanel`). Keep the change mechanical and covered by existing tests.
- If the sweep feels too broad for one PR, land #1 and #3 first and do this alone.

### 3. `src/components/atoms/Icon.tsx` (new)

- Thin wrapper over `FontAwesomeIcon` exposing `icon` + size/className, with the
  app's default sizing. Migrate the direct `FontAwesomeIcon` imports to `Icon`
  incrementally (can trail behind in a follow-up; not all-or-nothing).

### 4. Slim `GroceryListItem`

- Extract a presentational **`ListItemRow`** (name, quantity, optional
  line-through/checked styling, optional delete affordance, an optional `badge`
  slot) with no sheet state.
- Move the aisle badge + picker ownership into a thin wrapper (or lift `sheetOpen`
  to a controlled `onBadgeClick`/`pickerOpen` prop pair so the row is testable
  without the sheet). `ShoppingListBuilder` composes the wrapper; `DefaultListEditor`
  uses the bare `ListItemRow` and stops receiving unused props.
- Preserve all current behavior: tappable badge for unchecked/uncategorized
  items, `stopPropagation` so badge/delete taps don't toggle the row, checked
  styling.

## Files to change

| File | Change |
| --- | --- |
| `src/components/atoms/Button.tsx` | Default `type="button"`; split intent vs shape axis. |
| `src/components/atoms/Icon.tsx` | **New** Font Awesome wrapper atom. |
| `src/components/molecules/GroceryListItem.tsx` | Split into `ListItemRow` + thin aisle wrapper (or controlled picker). |
| Call sites of `Button` | Mechanical migration to new variant/shape API. |
| `DefaultListEditor.tsx`, `ShoppingListBuilder.tsx` | Use the appropriate row variant. |

## Implementation checklist

- [ ] `Button` defaults to `type="button"`; verify the two `type="submit"` Add buttons unaffected.
- [ ] Reshape `Button` variant/shape axes; sweep all call sites; existing button tests green.
- [ ] Create `Icon` atom; migrate `FontAwesomeIcon` usages (may be incremental).
- [ ] Split `GroceryListItem` into `ListItemRow` + wrapper; remove unused props from the default-list path.
- [ ] Unit tests: `Button` default type + each shape; `ListItemRow` in isolation (no picker).
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` — delete item, toggle item, re-pick aisle, default-list add/remove all green.

## Tests

### Unit (RTL, **no mocks**)

- **`Button.test.tsx`** (extend): renders `type="button"` by default; `type="submit"`
  honored when passed; each variant/shape produces the expected classes.
- **`ListItemRow.test.tsx`** (new): renders name/quantity; checked → line-through;
  delete affordance calls `onDelete` and not `onToggle`; renders an injected badge
  slot — all **without** the aisle picker.
- Keep the existing `GroceryListItem.test.tsx` badge→picker behavior on the
  wrapper.

## Out of scope

- Adding a `Checkbox` atom (the check-off UX is row-tap + line-through by design).
- Animations.
- Any data-layer change.
