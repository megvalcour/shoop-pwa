# Task: Manually categorize an uncategorized item

## Problem

A user can recategorize an item that already has an aisle (tap its aisle badge →
`AislePickerSheet` → pick), but **cannot** assign an aisle to an item sitting in
the **Uncategorized** group. There is no affordance to open the picker for those
items.

### Root cause

- The recategorize UI is the tappable aisle `Badge` in
  `src/components/molecules/GroceryListItem.tsx`. It only renders when
  **`!isAnalyzing && aisleLabel`** (line ~49). Uncategorized items have no
  `aisleLabel`, so instead they get the non-interactive pulsing `…` badge
  (rendered when `isAnalyzing`), which has no `onClick`.
- In `src/components/organisms/ShoppingListBuilder.tsx` (`renderListItem`,
  line ~71), **every** unchecked item with an empty/unknown `aisle_id` gets
  `isAnalyzing = true`. So genuinely-uncategorized items are indistinguishable
  from in-flight ones and never expose the picker.

### Manual-override semantics (must be preserved)

The existing override rule is implicit: the auto-classifier only ever writes to
items with `aisle_id === ''` (see `AddItemForm` — both the on-add `classify` and
the `isReady` deferred-reclassify loop). Once an aisle is set, `aisle_id !== ''`
acts as a lock the classifier never overwrites. Recategorizing a *categorized*
item therefore never races the classifier.

Letting the user categorize an item **while it is still uncategorized** opens a
race the categorized path never had: a `classify()` call already in flight (from
add, or from the `isReady` reclassify loop) can resolve *after* the manual pick
and clobber it, because `useUpdateItemAisle` does an unconditional `put`. To
follow the same override logic ("a set aisle is never auto-overwritten"), the
**auto-classify write path must become conditional** (write only while the item
is still `aisle_id === ''`), while the **manual pick stays unconditional and
always wins**.

## Relevant ADRs

- **ADR-0009** (on-demand shopping list model) and **ADR-0011** (layered aisle
  matching): low-confidence items land in Uncategorized — unchanged.
- **ADR-0013** (web-worker aisle inference): the async classify→write path is the
  source of the race; this plan adds a guard to its write, not its inference.

No ADR is contradicted. No new ADR required (no architectural boundary changes).

## Approach

Two parts: (A) expose the picker for uncategorized items; (B) guard the
auto-classifier so a manual choice is never clobbered.

### Part A — Expose the picker for uncategorized items

`src/components/molecules/GroceryListItem.tsx`

- Make the badge open `AislePickerSheet` for **unchecked** items regardless of
  whether they have an `aisleLabel`, as long as `aisles` and `onAisleChange` are
  provided:
  - `isAnalyzing` (no aisle): render the `…` badge but make it tappable —
    `onClick` opens the sheet, with `aria-label="Categorize item"`. Keep the
    `animate-pulse` hint so the in-progress feel is retained.
  - has `aisleLabel`: unchanged (already tappable → "Change aisle: …").
- Checked items remain non-interactive (no behavior change).
- Reuse the existing `sheetOpen` state and `AislePickerSheet` block at the bottom
  of the component; `currentAisleId=''` already renders the sheet with nothing
  selected, which is correct for an uncategorized item.

`src/components/organisms/ShoppingListBuilder.tsx`

- No structural change required: `renderListItem` already passes `aisles`,
  `currentAisleId`, and `onAisleChange` for uncategorized items. The
  `onAisleChange` → `updateItemAisle.mutate({ itemId, aisleId })` wiring is the
  same one used for categorized items, so the manual write is unchanged.

### Part B — Guard auto-classification (preserve override logic)

`src/hooks/useItems.ts`

- Extend `UpdateItemAisleInput` with an optional `auto?: boolean` (default
  `false` = manual).
  - Manual (`auto` falsy): unconditional `put` — current behavior. Manual pick
    always wins.
  - Auto (`auto: true`): re-read the item inside the mutation and **skip the
    write if `aisle_id !== ''`** (someone has set an aisle in the meantime —
    manual choice wins). This generalizes the existing implicit lock to the new
    in-flight window.

`src/components/organisms/AddItemForm.tsx`

- Pass `auto: true` at the two classifier write sites:
  - the `isReady` deferred-reclassify loop (`updateItemAisle.mutate({ itemId,
    aisleId })`), and
  - the on-add `onSuccess` classify (`updateItemAisle.mutate({ itemId:
    result.newItemId, aisleId })`).
- The manual picker path (`ShoppingListBuilder`) keeps calling without `auto`, so
  it stays unconditional.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/GroceryListItem.tsx` | Make the `…`/aisle badge open the picker for unchecked uncategorized items. |
| `src/hooks/useItems.ts` | Add `auto?` flag to `useUpdateItemAisle`; auto writes skip if already categorized. |
| `src/components/organisms/AddItemForm.tsx` | Pass `auto: true` at the two classify→write sites. |

(`ShoppingListBuilder.tsx` needs no change but is verified by tests.)

## Tests

- `src/components/molecules/__tests__/GroceryListItem.test.tsx`
  - Uncategorized unchecked item (`isAnalyzing`, no `aisleLabel`, `aisles` +
    `onAisleChange` provided): the badge is tappable and opens the sheet;
    selecting an aisle calls `onAisleChange` with that aisle id.
  - Tapping the badge does not call `onToggle` (stopPropagation still holds).
  - Checked item exposes no picker affordance.
- `src/hooks/__tests__/useItems.test.ts` (create if absent; otherwise extend)
  - Manual update (`auto` omitted) overwrites an existing `aisle_id`.
  - Auto update (`auto: true`) writes when `aisle_id === ''`.
  - Auto update is a no-op when `aisle_id` is already set (override preserved).
- `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx`
  - From the Uncategorized group, opening the picker and choosing an aisle moves
    the item into the matching aisle group (drives `updateItemAisle`).
- `src/components/organisms/__tests__/AddItemForm.test.tsx` (if present)
  - Confirm classify→write sites pass `auto: true` (or assert no clobber via the
    hook-level guard test if the form test can't observe the flag cleanly).

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — exercise: add an item that stays Uncategorized, tap it,
   pick an aisle, confirm it moves into the aisle group and stays there (no
   late classifier reverting it).

## Out of scope

- Distinguishing "actively analyzing" from "settled-but-uncategorized" (would
  need an inference-state flag/field). Not required to fix this bug; the tappable
  `…` badge serves both states.
- Adding a persisted `aisle_source`/`aisle_locked` schema field. The implicit
  `aisle_id !== ''` lock plus the Part B guard is sufficient and avoids a
  `DB_VERSION` migration.
