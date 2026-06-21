# Task: List manual aisle overrides on Settings + allow deletion

## Problem

A user can manually correct an item's aisle (tap the aisle `Badge` →
`AislePickerSheet` → pick). That correction is written to the **global `items`**
record's `aisle_id` and silently persists across every list. There is no place
to **see** which items the user has manually overridden, nor to **undo** one.

We want a "Manual overrides" section on the Settings screen that lists every
manually-overridden item and lets the user delete (clear) an override.

## Key constraint discovered

The schema does **not** currently distinguish a manual aisle pick from an
auto-classified one. Both write paths call the same
`useUpdateItemAisle({ itemId, aisleId })`:

- `src/components/organisms/AddItemForm.tsx` — auto-classifier (two sites).
- `src/components/organisms/ShoppingListBuilder.tsx` — manual pick
  (`onAisleChange`).

`Item` only has `aisle_id` (no `aisle_source`/`aisle_overridden`). The prior task
(`tasks/complete--manual-categorize-uncategorized.md`) explicitly deferred adding
such a field. To build a "manual overrides" list we must now add one.

**Decisions (confirmed with user):**

1. **Define overrides via a tracking flag.** Add `aisle_overridden: boolean` to
   the `items` store (DB v2→v3 migration, backfilled to `false`). The manual pick
   path sets it `true`; the auto-classifier leaves it `false`. _Caveat: corrections
   made before this ships cannot be detected retroactively — only overrides made
   after this lands will appear._
2. **Delete = clear the override.** Reset the item's `aisle_id` to `''` and
   `aisle_overridden` to `false`, returning it to Uncategorized so the
   auto-classifier can re-handle it. The global `items` row persists. (Not a
   hard item delete.)

## Relevant ADRs

- **ADR-0011** (layered aisle matching) / **ADR-0013** (web-worker aisle
  inference): the auto-classify write path now also records `aisle_overridden:
  false`; inference logic is unchanged.
- No ADR is contradicted. Adding a non-architectural boolean column + a
  conventional append-only migration needs no new ADR.

## Approach

### 1. Schema + migration (`src/db/schema.ts`, `src/db/idbClient.ts`)

- `schema.ts`: add `aisle_overridden: boolean;` to `Item`. Bump
  `DB_VERSION` `2 → 3`.
- `idbClient.ts`: append a new migration block (append-only — never edit existing
  cases):
  ```ts
  if (oldVersion < 3) {
    const tx = ... // cursor over 'items'
    // set aisle_overridden = false on every existing row
  }
  ```
  (Use the `upgrade` transaction; iterate the `items` store with a cursor and
  `put` each row with `aisle_overridden: false`.)
- Seed data (`oxford-62.json`): seed items currently lack the field. Backfill at
  seed time in `seedDatabase` (set `aisle_overridden: false` when adding seed
  items) so the type is satisfied without editing the JSON asset.

### 2. Hooks (`src/hooks/useItems.ts`)

- Extend `UpdateItemAisleInput` with optional `overridden?: boolean` (default
  `false`). In `useUpdateItemAisle`, write
  `{ ...item, aisle_id: aisleId, aisle_overridden: overridden ?? false }`.
  - Manual pick (`ShoppingListBuilder`) passes `overridden: true`.
  - Auto-classifier (`AddItemForm`, both sites) omits it → stays `false`.
- Add `useClearAisleOverride()` mutation: given `itemId`, re-read the item and
  `put` `{ ...item, aisle_id: '', aisle_overridden: false }`; invalidate
  `['items']`. This is the "delete override" action.
- Add a small selector hook `useOverriddenItems()` (or filter `useItems()` in the
  route) returning items where `aisle_overridden === true`. Prefer filtering in
  the route to avoid an extra hook unless it reads cleaner as a hook.

### 3. Wire the manual-pick call site (`src/components/organisms/ShoppingListBuilder.tsx`)

- Line ~86: `updateItemAisle.mutate({ itemId: li.item_id, aisleId: newAisleId, overridden: true })`.
- `AddItemForm.tsx` needs **no change** (omitting the flag yields `false`).

### 4. UI — reuse `GroceryListItem` (DRY) (`src/components/molecules/GroceryListItem.tsx`)

The override row must look like an individual list item: name + aisle badge +
trash. Reuse `GroceryListItem` rather than build a new molecule. Two minimal,
backward-compatible tweaks:

- Make `quantity` **optional**; only render the `×{quantity}` span when it is a
  number. (Override rows have no quantity.)
- When the aisle `Badge` has no `onAisleChange`/`aisles`, render it
  **non-interactive** (no `onClick`, no "Change aisle" affordance) so the
  override list shows the aisle as a plain label. (Today the badge always wires
  `onClick`, but the sheet is already guarded by `aisles && onAisleChange`, so
  tapping is a no-op; make it explicitly static for clarity/a11y.)

All existing call sites keep working (they pass `quantity` and, for unchecked
items, `aisles`/`onAisleChange`).

### 5. Settings screen (`src/routes/SettingsRoute.tsx`)

Add a **"Manual overrides"** `<section>` (between "Your Lists" and "Default
List", or after Default List — match visual rhythm):

- Read `useItems()` + `useAisles()`; build `aisle_id → label` map.
- Filter items to `aisle_overridden === true`, sort by name.
- States: loading (`Loading…`), error (`Failed to load overrides.`), empty
  (`No manual overrides.`).
- Render each as `<ul className="flex flex-col gap-2">` of `GroceryListItem`:
  - `name={item.name}`
  - `aisleLabel={aisleMap.get(item.aisle_id)}`
  - `onDelete={() => setPendingOverride(item)}`
  - (no `quantity`, no `onToggle`, no `aisles`/`onAisleChange`)
- Confirm via existing `ConfirmDialog`:
  - title `"Remove override?"`, message
    `"{name} will return to Uncategorized and be re-sorted automatically."`,
    confirmLabel `"Remove"`.
  - on confirm → `clearAisleOverride.mutate(item.id, { onSuccess: close })`.
  - reuse the same `pendingDelete`-style state pattern already in the route.

## Files to change

| File | Change |
| --- | --- |
| `src/db/schema.ts` | Add `aisle_overridden` to `Item`; bump `DB_VERSION` to 3. |
| `src/db/idbClient.ts` | Append `oldVersion < 3` migration (backfill `false`); set flag in seed. |
| `src/hooks/useItems.ts` | `overridden?` flag on update; add `useClearAisleOverride`. |
| `src/components/organisms/ShoppingListBuilder.tsx` | Pass `overridden: true` on manual pick. |
| `src/components/molecules/GroceryListItem.tsx` | Optional `quantity`; static badge when not editable. |
| `src/routes/SettingsRoute.tsx` | New "Manual overrides" section + clear-override confirm. |

## Tests

- `src/hooks/__tests__/useItems.test.ts` (create/extend):
  - manual update sets `aisle_overridden: true`; auto update keeps it `false`.
  - `useClearAisleOverride` resets `aisle_id` to `''` and flag to `false`.
- `src/components/molecules/__tests__/GroceryListItem.test.tsx`:
  - renders without `quantity` (no `×` shown); badge static when no
    `onAisleChange` (tapping does nothing / not a button).
  - existing behaviors unchanged.
- `src/routes/__tests__/SettingsRoute.test.tsx`:
  - lists only overridden items; empty state when none; trash → ConfirmDialog →
    confirm calls clear mutation and removes the row.
- DB migration: a focused test (or manual note) that opening v3 backfills
  existing items with `aisle_overridden: false`.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — manually override an item's aisle in a list, confirm it
   appears under Settings → Manual overrides, delete it, confirm it disappears
   and the item returns to Uncategorized.

## Out of scope

- Retroactively detecting overrides made before this ships (not distinguishable).
- Editing an override's aisle from the Settings list (delete-only for now; user
  can re-pick from within a list). Could be a fast follow if desired.
- De-duplicating multiple `items` rows sharing a `canonical_name` (separate bug).
