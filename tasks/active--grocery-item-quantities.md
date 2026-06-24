# Task: Grocery List Item Quantities

> Allow users to add/edit quantities on grocery list items (e.g., "2 lbs",
> "3 cans"). Decided scope (confirmed with the user):
>
> - **Format:** number **+ unit** — quantity stays a `number`; a free-text
>   `unit` string is added to `ListItem` to match `DefaultListEntry`, which
>   already carries both. Requires a `DB_VERSION` bump + append-only migration.
> - **Surfaces:** **both** the default-list template (`DefaultListEditor`) and
>   real shopping lists (`ShoppingListBuilder` / `GroceryListItem`). Seeding a
>   new list from the default carries quantity **and** unit forward.

## Problem

### Current state

- **Schema.** `DefaultListEntry` has `quantity: number`, `unit: string`,
  `notes: string` (`src/db/schema.ts:45`). `ListItem` has **only**
  `quantity: number` — no `unit` (`src/db/schema.ts:59`). `DB_VERSION` is `4`.
- **Display.** `ListItemRow` always renders `×{quantity}` as static text
  (`ListItemRow.tsx:34`) with no unit and no edit affordance. It is the shared
  row for both `DefaultListEditor` and (via `GroceryListItem`) the shopping list.
- **Writes.** Both add paths hardcode quantity: `useAddListItem` sets
  `quantity: 1` (`useListItems.ts:91`); `useAddDefaultListItem` sets
  `quantity: 1, unit: '', notes: ''` (`useDefaultList.ts:50`). **No update
  mutation for quantity/unit exists** on either store.
- **Seeding.** `useCreateShoppingList` copies `entry.quantity` into seeded list
  items but cannot copy `unit` (the field doesn't exist on `ListItem`)
  (`useShoppingLists.ts:51`).

So the only gaps are: (1) `ListItem` can't hold a unit, (2) there are no update
mutations, and (3) there is no UI to edit either field.

### Goal

A user can tap an item's quantity (on the default list or a shopping list),
adjust the count and an optional unit in a bottom sheet, and see it persist
(`2 lbs`, `3 cans`). New items still default to qty `1` / no unit; seeding a
list from the default carries both fields.

## Relevant ADRs

- **ADR-0002 (IndexedDB for core storage):** schema change is a `DB_VERSION`
  4 → 5 bump with an **append-only** `if (oldVersion < 5)` case
  (CLAUDE.md migration rule). Existing `list_items` rows are backfilled with
  `unit: ''` so reads are type-safe. No existing case is rewritten.
- **ADR-0004 (Zustand + TanStack Query):** quantity/unit are **persistent**
  data → new TanStack Query mutations with optimistic updates (mirroring the
  existing `useToggleListItem` / `useRemoveDefaultListItem` patterns). Sheet
  open/close is **local component state** (exactly like the existing aisle
  picker in `GroceryListItem`) — **no Zustand needed.**
- **ADR-0005 (Atomic design):** new editing UI is a `QuantitySheet` **molecule**
  (a `BottomSheet` + atoms), the same shape as `AislePickerSheet`. Molecules
  take callbacks only — no store access. Mutations are wired in the organisms
  (`ShoppingListBuilder`, `DefaultListEditor`).
- **ADR-0009 (on-demand list model) / ADR-0015 (store-agnostic items):**
  quantity and unit are properties of the **list entry**, not of an
  item-at-a-store, so they stay store-agnostic and don't interact with
  `item_locations` or aisle classification. No conflict; **no new ADR required.**

## Approach

Five pieces: schema/migration, a display formatter, the edit sheet, two update
mutations, and wiring each surface.

### A. Schema + migration

`src/db/schema.ts`

- Add `unit: string;` to the `ListItem` interface (place it after `quantity` to
  mirror `DefaultListEntry`).
- Bump `DB_VERSION` from `4` to `5`.

`src/db/idbClient.ts`

- Append a new case (do **not** touch cases 1–4):

  ```ts
  if (oldVersion < 5) {
    // Backfill the new ListItem.unit field on existing rows so reads are
    // type-safe. A fresh install reaches this with an empty list_items store
    // and is unaffected; new rows set unit explicitly from here on.
    const store = tx.objectStore('list_items');
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.unit === undefined) {
        await cursor.update({ ...cursor.value, unit: '' });
      }
      cursor = await cursor.continue();
    }
  }
  ```

- `seedDatabase` / `resetUserData` need **no change** (they don't create
  `list_items`; `default_list` already has `unit`).

### B. Display formatter (pure)

`src/lib/formatQuantity.ts` (new)

```ts
/** Renders an item quantity for display. With a unit: "2 lbs". Without one,
 *  the bare multiplier form the app has always shown: "×2". */
export function formatQuantity(quantity: number, unit?: string): string {
  const u = unit?.trim();
  return u ? `${quantity} ${u}` : `×${quantity}`;
}
```

Keeping it pure and separate makes it trivially unit-testable and keeps
`ListItemRow` free of formatting branches.

### C. `QuantitySheet` molecule

`src/components/molecules/QuantitySheet.tsx` (new) — same shape as
`AislePickerSheet` (wraps `BottomSheet`, takes callbacks only).

- Props: `quantity: number`, `unit: string`, `onSave: (quantity: number, unit:
  string) => void`, `onClose: () => void`.
- Local `useState` for the in-progress quantity + unit (seeded from props).
- A small stepper: `−` `Button`, the current number, `+` `Button` (reuse the
  `Button` atom + `Icon` with `faMinus`/`faPlus`). Min clamp at `1`; integer
  steps. Plus an `Input` (`type="text"`, the `Input` atom) for the unit,
  placeholder `"unit (optional)"`.
- A `Save` `Button` calls `onSave(quantity, unit.trim())` then `onClose()`.
- Accessibility: stepper buttons get `aria-label="Increase quantity"` /
  `"Decrease quantity"`; the unit input gets an `sr-only` label.

> Decimal quantities (`1.5 lbs`) are out of scope — the stepper is integer-only,
> min 1. Noted under Out of scope.

### D. Update mutations

`src/hooks/useListItems.ts` — `useUpdateListItem`

```ts
interface UpdateListItemInput {
  id: string;
  listId: string;
  quantity: number;
  unit: string;
}
```

Read-modify-write the row (`db.get` → `db.put({ ...row, quantity, unit })`),
with the **same optimistic pattern** as `useToggleListItem`
(`onMutate` snapshot + `setQueryData`, `onError` rollback, `onSettled`
invalidate `['list_items', listId]`).

`src/hooks/useDefaultList.ts` — `useUpdateDefaultListItem`

```ts
interface UpdateDefaultListItemInput {
  id: string;
  quantity: number;
  unit: string;
}
```

Same optimistic shape against `['default_list']` (mirror
`useRemoveDefaultListItem`). Preserve the existing `notes` field on write
(spread the existing row).

### E. Wire the surfaces

`src/components/molecules/ListItemRow.tsx`

- Add props: `unit?: string` and `onQuantityClick?: () => void`.
- Render the quantity via `formatQuantity(quantity, unit)`.
- When `onQuantityClick` is provided, render the quantity as a **tappable**
  control (a `Badge` or button) with `aria-label="Edit quantity"` and
  `onClick={(e) => { e.stopPropagation(); onQuantityClick(); }}` so tapping it
  never toggles the row (same `stopPropagation` guard the delete button and
  aisle badge already use). When absent, render the static text as today
  (keeps any read-only callers unchanged).

`src/components/molecules/GroceryListItem.tsx`

- Add props `unit?: string` and `onQuantityChange?: (quantity: number, unit:
  string) => void`.
- Add a second local `useState` (`qtySheetOpen`) alongside the existing
  `sheetOpen` for the aisle picker. Pass `onQuantityClick={() =>
  setQtySheetOpen(true)}` and `unit` down to `ListItemRow` (only when
  `onQuantityChange` is wired). Render `<QuantitySheet>` when open, calling
  `onQuantityChange` on save.
- Editing quantity is allowed regardless of `checked` (unlike the aisle badge,
  which is unchecked-only) — quantity is meaningful on done items too.

`src/components/organisms/ShoppingListBuilder.tsx`

- Instantiate `const updateItem = useUpdateListItem();`.
- In `renderListItem`, pass `unit={li.unit}` and
  `onQuantityChange={(quantity, unit) => updateItem.mutate({ id: li.id, listId,
  quantity, unit })}` into `GroceryListItem`.

`src/components/organisms/DefaultListEditor.tsx`

- Instantiate `const updateItem = useUpdateDefaultListItem();`.
- Track `const [editing, setEditing] = useState<DefaultListEntry | null>(null);`.
- Pass `unit={entry.unit}` and `onQuantityClick={() => setEditing(entry)}` into
  each `ListItemRow`. Render a single `<QuantitySheet>` when `editing` is set,
  whose `onSave` calls `updateItem.mutate({ id: editing.id, quantity, unit })`
  then `setEditing(null)`.

`src/hooks/useShoppingLists.ts`

- In the seed map, add `unit: entry.unit` to each seeded `ListItem` so a list
  created from the default carries the unit forward (qty already copied).

`src/hooks/useListItems.ts` (add path) — set `unit: ''` on the new `ListItem`
in `addListItem` so freshly-added rows are well-formed (add defaults to qty 1,
no unit; the user edits afterward).

### F. Docs

- Update the **CLAUDE.md** data-model block: the `list_items` line gains `unit`.
  (CLAUDE.md is project docs, not an ADR, so this is a normal edit.)

## Files to change

| File | Change |
| --- | --- |
| `src/db/schema.ts` | add `unit: string` to `ListItem`; `DB_VERSION` 4 → 5. |
| `src/db/idbClient.ts` | new append-only `if (oldVersion < 5)` case backfilling `unit: ''`. |
| `src/lib/formatQuantity.ts` | **new** pure formatter (`"2 lbs"` / `"×2"`). |
| `src/components/molecules/QuantitySheet.tsx` | **new** molecule: stepper + unit input in a `BottomSheet`. |
| `src/components/molecules/ListItemRow.tsx` | add `unit` + `onQuantityClick`; tappable quantity via `formatQuantity`. |
| `src/components/molecules/GroceryListItem.tsx` | add `unit` + `onQuantityChange`; manage the quantity sheet. |
| `src/components/organisms/ShoppingListBuilder.tsx` | wire `useUpdateListItem`; pass `unit`/`onQuantityChange`. |
| `src/components/organisms/DefaultListEditor.tsx` | wire `useUpdateDefaultListItem`; track edited entry; render sheet. |
| `src/hooks/useListItems.ts` | add `useUpdateListItem`; set `unit: ''` on add. |
| `src/hooks/useDefaultList.ts` | add `useUpdateDefaultListItem` (preserve `notes`). |
| `src/hooks/useShoppingLists.ts` | seed `unit` from the default entry. |
| `CLAUDE.md` | data-model: `list_items` gains `unit`. |

## Tests

- `src/db/__tests__/idbClient.test.ts` (extend): a v4 DB with a `list_items`
  row lacking `unit` → after upgrade the row has `unit: ''`; a fresh install is
  unaffected.
- `src/lib/__tests__/formatQuantity.test.ts` (new): unit present → `"2 lbs"`;
  empty/whitespace unit → `"×2"`.
- `src/components/molecules/__tests__/QuantitySheet.test.tsx` (new): stepper
  increments/decrements and clamps at 1; unit input edits; Save calls `onSave`
  with the trimmed unit and closes.
- `src/components/molecules/__tests__/ListItemRow.test.tsx` (extend): renders
  `"2 lbs"` with a unit and `"×2"` without; when `onQuantityClick` is set the
  quantity is tappable and tapping it fires the callback **without** firing
  `onToggle` (stopPropagation); read-only when absent.
- `src/components/molecules/__tests__/GroceryListItem.test.tsx` (extend):
  tapping the quantity opens `QuantitySheet`; saving calls `onQuantityChange`;
  the aisle picker still works independently.
- `src/hooks/__tests__/useListItems.test.ts` (extend): `useUpdateListItem`
  persists quantity+unit with optimistic update + rollback on error; add path
  sets `unit: ''`.
- `src/hooks/__tests__/useDefaultList.test.ts` (extend):
  `useUpdateDefaultListItem` persists quantity+unit and preserves `notes`.
- `src/hooks/__tests__/useShoppingLists.test.ts` (extend): seeding carries
  `unit` from default entries into the new list items.
- `src/components/organisms/__tests__/DefaultListEditor.test.tsx` (extend):
  edit-quantity flow opens the sheet and calls the update mutation.
- `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx` (extend):
  rows receive `unit`; quantity edit triggers the list-item update.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — manual-equivalent flows:
   - On a shopping list, tap an item's quantity, set `3` + `cans`, save → row
     shows `3 cans` and persists across reload.
   - On the default list, set a quantity/unit, then create a new list from the
     default → the seeded item carries the quantity **and** unit.
   - Tapping the quantity never toggles the item's checked state.
   - Upgrade path: an install created before this change still loads (existing
     list items render `×N`, no crash from a missing `unit`).

## Out of scope

- **Decimal/fractional quantities** (`1.5 lbs`) — stepper is integer-only,
  min 1. A future enhancement if needed.
- **A unit picker / canonical unit list** — unit is free text. Suggesting
  common units (lbs, oz, cans…) is a separate UX task.
- **Editing `notes`** on default entries — the field exists but stays untouched
  here (the update mutation preserves it).
- **Specifying quantity at add-time** — the add form stays a single fast-entry
  field defaulting to qty 1; quantity is set via edit afterward.
- **Aggregating quantities** when the same item is added twice — dedupe behavior
  is unchanged.
