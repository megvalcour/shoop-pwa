# Task: Item Quantities + Duplicate-Add Increment

> Add quantities to each grocery item: a **unitless stepper by default** with an
> **option to add a free-text unit**. When the same item name is added twice
> (**case-insensitive exact string match only — no fuzzy/semantic match**) it is
> **incremented one step** on the existing entry instead of creating a second
> row. This applies on shopping lists, the default list, and (for the dedup
> behavior) the recipe-import flow.
>
> Scope split (confirmed): the **dedup-increment** works for recipe import for
> free because import reuses the same add mutations. **Carrying a recipe's
> parsed quantity/unit** (e.g. "2 cups flour" → qty 2, unit "cups") is broken out
> to its own backlog task — see _Out of scope / Follow-ups_.

## Background: a stale "complete" plan

`tasks/complete--grocery-item-quantities.md` describes an earlier cut of the
quantity-editing feature, but it was **never implemented** (code-verified:
`ListItem` has no `unit`, there is no `QuantitySheet`, no `formatQuantity`, no
update mutation, and `ListItemRow` still renders static `×{quantity}`). Its
assumptions are also stale (it says `DB_VERSION` is `4`; it is now `5`). That
plan also explicitly listed *duplicate-add aggregation* as **out of scope** —
which is precisely the behavior this task adds. This plan supersedes it. The
old file should be renamed `tasks/backlog--grocery-item-quantities.md` (the name
PLAN.md already points at) or removed; do not treat it as done.

## Problem

### Current state (verified)

- **Schema** (`src/db/schema.ts`): `DefaultListEntry` already has
  `quantity: number`, `unit: string`, `notes: string`. `ListItem` has
  `quantity: number` but **no `unit`**. `DB_VERSION` is `5`.
- **Display** (`src/components/molecules/ListItemRow.tsx:34`): always renders
  `×{quantity}` as static text — no unit, no edit affordance. It is the shared
  row for both `DefaultListEditor` and (via `GroceryListItem`) the shopping list.
- **Add paths dedup but _no-op_ on a duplicate:**
  - `useAddListItem` → `addListItem` (`src/hooks/useListItems.ts:83-85`): if a
    `list_items` row for `(listId, itemId)` already exists, it **returns early**
    without adding. New rows hardcode `quantity: 1` (`:87-95`).
  - `useAddDefaultListItem` (`src/hooks/useDefaultList.ts:45-47`): same — if an
    entry for `itemId` exists it returns early. New entries hardcode
    `quantity: 1, unit: '', notes: ''`.
- **Case-insensitive matching already exists.** Both paths call
  `resolveItem(allItems, name)` (`src/db/items.ts`), which matches on
  `canonical_name === name.toLowerCase()`. "Milk", "milk", and "MILK" all
  resolve to the same `item_id`. This is exactly the "case-insensitive string
  match only, no fuzzy" rule the task asks for — **reuse it, add nothing.**
- **No update mutation** for quantity/unit exists on either store; there is no
  UI to edit either field.
- **Seeding** (`src/hooks/useShoppingLists.ts:47-55`): a list seeded from the
  default copies `entry.quantity` but cannot copy `unit` (the field is absent on
  `ListItem`).
- **Recipe import** (`src/components/organisms/RecipeImporter.tsx:92-111`):
  commits each selected ingredient through `addDefaultItem.mutateAsync(name)` or
  `addListItem.mutateAsync({ listId, name })`. `normalizeIngredient` already
  parses `quantity`/`unit` (`src/lib/normalizeIngredient.ts`) but `RecipeImporter`
  passes **only `ingredient.name`**, discarding them. Imports run sequentially
  (`for … await`), so they never trip the in-flight guard.

### Goal

1. Every item carries an integer quantity, shown as a tappable control. Tapping
   opens a small **stepper** (− / count / +) plus an **optional free-text unit**
   input. With a unit it reads `2 lbs`; without one it reads the existing `×2`.
   Editing works on both the default list and shopping lists, and persists.
2. Adding an item whose name already exists in that list/default (case-insensitive)
   **increments the existing entry's quantity by one** instead of adding a second
   row. This holds for manual add **and** recipe import.

## Relevant ADRs

- **ADR-0002 (IndexedDB for core storage):** adding `unit` to `ListItem` is a
  `DB_VERSION` **5 → 6** bump with an **append-only** `if (oldVersion < 6)` case
  (CLAUDE.md migration rule). Existing `list_items` rows are backfilled with
  `unit: ''`. No existing case is touched.
- **ADR-0004 (Zustand + TanStack Query):** quantity/unit are **persistent** data
  → new TanStack Query mutations with optimistic updates, mirroring
  `useToggleListItem` / `useRemoveDefaultListItem`. The duplicate-increment is a
  change to the existing add mutations, not new state. Sheet open/close is
  **local component state** (like the existing aisle picker) — no Zustand.
- **ADR-0005 (Atomic design):** the editor is a `QuantitySheet` **molecule**
  (a `BottomSheet` + atoms), same shape as `AislePickerSheet`. Molecules take
  callbacks only; mutations are wired in the organisms.
- **ADR-0009 (on-demand lists) / ADR-0015 (store-agnostic items):** quantity and
  unit are properties of the **list/default entry**, not of an item-at-a-store,
  so they stay store-agnostic and never touch `item_locations` or aisle
  classification. **No new ADR required.**

## Approach

Six pieces: schema/migration, the dedup-increment behavior, a display formatter,
the edit sheet, two update mutations, and wiring each surface.

### A. Schema + migration

`src/db/schema.ts`
- Add `unit: string;` to `ListItem` (after `quantity`, mirroring
  `DefaultListEntry`).
- Bump `DB_VERSION` `5` → `6`.

`src/db/idbClient.ts`
- Append a new case (do **not** edit cases 1–5):

  ```ts
  if (oldVersion < 6) {
    // Backfill ListItem.unit on existing rows so reads are type-safe. A fresh
    // install reaches this with an empty list_items store and is unaffected;
    // new rows set unit explicitly from here on.
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

### B. Duplicate-add → increment (the dedup behavior)

`src/hooks/useListItems.ts` — in `addListItem`, replace the early-return no-op
with an increment of the existing row:

```ts
const existing = allListItems.find(
  (li) => li.list_id === listId && li.item_id === itemId,
);
if (existing) {
  await db.put('list_items', { ...existing, quantity: existing.quantity + 1 });
  return { itemCreated: false, newItemId: '', incremented: true };
}
```

- Extend `AddListItemResult` with `incremented: boolean` (default `false` on the
  add branch) so callers/tests can distinguish "added" from "bumped". The
  `onSuccess` invalidation of `['list_items', listId]` already covers the bumped
  row — no extra invalidation needed.
- A brand-new catalog item can never already be in the list, so the increment
  branch only runs when `itemCreated` is false; no interaction with the
  item-creation transaction.
- The in-flight guard (`inFlightAdds`) stays: it serialises a true double-fire of
  the same name. Sequential awaits (recipe import) pass through fine and each
  increments.

`src/hooks/useDefaultList.ts` — same change in `useAddDefaultListItem`: replace
the `return { itemCreated: false }` no-op with an increment of the matched
entry's `quantity` (spread the row to preserve `unit`/`notes`), returning
`{ itemCreated: false, incremented: true }`.

> "Incremented a unit up" = **+1 on the integer stepper** (one step), not a
> change to the `unit` string. Quantity is clamped to integers ≥ 1 everywhere.

### C. Display formatter (pure)

`src/lib/formatQuantity.ts` (new):

```ts
/** Render an item quantity. With a unit: "2 lbs"; without: the bare "×2". */
export function formatQuantity(quantity: number, unit?: string): string {
  const u = unit?.trim();
  return u ? `${quantity} ${u}` : `×${quantity}`;
}
```

Pure + separate keeps `ListItemRow` free of formatting branches and makes it
trivially unit-testable.

### D. `QuantitySheet` molecule

`src/components/molecules/QuantitySheet.tsx` (new) — same shape as
`AislePickerSheet` (wraps `BottomSheet`, callbacks only):

- Props: `quantity: number`, `unit: string`,
  `onSave: (quantity: number, unit: string) => void`, `onClose: () => void`.
- Local `useState` for in-progress quantity + unit (seeded from props).
- Stepper: `−` `Button`, current number, `+` `Button` (reuse `Button` atom +
  `Icon` with `faMinus`/`faPlus`). Integer steps, **min clamp at 1**.
- `Input` (`type="text"`) for the unit, placeholder `"unit (optional)"`,
  `sr-only` label.
- `Save` `Button` → `onSave(quantity, unit.trim())` then `onClose()`.
- A11y: stepper buttons get `aria-label="Increase quantity"` /
  `"Decrease quantity"`.

### E. Update mutations

`src/hooks/useListItems.ts` — `useUpdateListItem`:

```ts
interface UpdateListItemInput { id: string; listId: string; quantity: number; unit: string; }
```
Read-modify-write (`db.get` → `db.put({ ...row, quantity, unit })`) with the same
optimistic pattern as `useToggleListItem` (`onMutate` snapshot + `setQueryData`,
`onError` rollback, `onSettled` invalidate `['list_items', listId]`).

`src/hooks/useDefaultList.ts` — `useUpdateDefaultListItem`:

```ts
interface UpdateDefaultListItemInput { id: string; quantity: number; unit: string; }
```
Same optimistic shape against `['default_list']`; spread the existing row to
preserve `notes`.

### F. Wire the surfaces

`src/components/molecules/ListItemRow.tsx`
- Add props `unit?: string` and `onQuantityClick?: () => void`.
- Render the quantity via `formatQuantity(quantity, unit)`.
- When `onQuantityClick` is set, render the quantity as a **tappable** control
  (a `Badge`/button) with `aria-label="Edit quantity"` and
  `onClick={(e) => { e.stopPropagation(); onQuantityClick(); }}` so tapping never
  toggles the row (same `stopPropagation` guard the delete button uses). When
  absent, render static text exactly as today (read-only callers unchanged).

`src/components/molecules/GroceryListItem.tsx`
- Add props `unit?: string` and
  `onQuantityChange?: (quantity: number, unit: string) => void`.
- Add a second local `useState` (`qtySheetOpen`) alongside the aisle
  `sheetOpen`. Pass `unit` and `onQuantityClick={() => setQtySheetOpen(true)}`
  to `ListItemRow` only when `onQuantityChange` is wired. Render `<QuantitySheet>`
  when open, calling `onQuantityChange` on save.
- Quantity is editable regardless of `checked` (unlike the aisle badge) — it's
  meaningful on done items too.

`src/components/organisms/ShoppingListBuilder.tsx`
- `const updateItem = useUpdateListItem();`
- In `renderListItem`, pass `unit={li.unit}` and
  `onQuantityChange={(quantity, unit) => updateItem.mutate({ id: li.id, listId, quantity, unit })}`.

`src/components/organisms/DefaultListEditor.tsx`
- `const updateItem = useUpdateDefaultListItem();`
- `const [editing, setEditing] = useState<DefaultListEntry | null>(null);`
- Pass `unit={entry.unit}` and `onQuantityClick={() => setEditing(entry)}` to each
  `ListItemRow`. (Add the `unit`/`onQuantityClick` props to `ListItemRow` as in
  step F; `DefaultListEditor` uses `ListItemRow` directly, not `GroceryListItem`.)
  Render a single `<QuantitySheet>` when `editing` is set; `onSave` calls
  `updateItem.mutate({ id: editing.id, quantity, unit })` then `setEditing(null)`.

`src/hooks/useShoppingLists.ts`
- In the seed map, add `unit: entry.unit` to each seeded `ListItem` so a list
  created from the default carries the unit forward (qty already copied).

`src/hooks/useListItems.ts` (add path)
- Set `unit: ''` on the new `ListItem` in `addListItem` so fresh rows are
  well-formed (add defaults to qty 1, no unit; user edits afterward).

### G. Docs

- **CLAUDE.md** data-model block: the `list_items` line gains `unit`.

## Files to change

| File | Change |
| --- | --- |
| `src/db/schema.ts` | add `unit: string` to `ListItem`; `DB_VERSION` 5 → 6. |
| `src/db/idbClient.ts` | new append-only `if (oldVersion < 6)` case backfilling `unit: ''`. |
| `src/hooks/useListItems.ts` | duplicate-add increments existing row; `useUpdateListItem`; `unit: ''` on add; `incremented` in result. |
| `src/hooks/useDefaultList.ts` | duplicate-add increments existing entry; `useUpdateDefaultListItem`. |
| `src/hooks/useShoppingLists.ts` | seed `unit` from the default entry. |
| `src/lib/formatQuantity.ts` | **new** pure formatter (`"2 lbs"` / `"×2"`). |
| `src/components/molecules/QuantitySheet.tsx` | **new** stepper + unit input in a `BottomSheet`. |
| `src/components/molecules/ListItemRow.tsx` | add `unit` + `onQuantityClick`; tappable quantity via `formatQuantity`. |
| `src/components/molecules/GroceryListItem.tsx` | add `unit` + `onQuantityChange`; manage the quantity sheet. |
| `src/components/organisms/ShoppingListBuilder.tsx` | wire `useUpdateListItem`; pass `unit`/`onQuantityChange`. |
| `src/components/organisms/DefaultListEditor.tsx` | wire `useUpdateDefaultListItem`; track edited entry; render sheet. |
| `CLAUDE.md` | data-model: `list_items` gains `unit`. |
| `tasks/complete--grocery-item-quantities.md` | rename to `backlog--…` or remove — never implemented, superseded by this plan. |

## Tests

- `src/db/__tests__/idbClient.test.ts` (extend): a v5 DB with a `list_items` row
  lacking `unit` → after upgrade the row has `unit: ''`; fresh install unaffected.
- `src/lib/__tests__/formatQuantity.test.ts` (new): unit → `"2 lbs"`;
  empty/whitespace unit → `"×2"`.
- `src/hooks/__tests__/useListItems.test.ts` (extend):
  - adding a name already in the list (any casing) increments the existing row's
    quantity and adds **no** new row; result has `incremented: true`.
  - `useUpdateListItem` persists quantity+unit with optimistic update + rollback;
    add path sets `unit: ''` and qty 1.
- `src/hooks/__tests__/useDefaultList.test.ts` (extend): duplicate add increments
  the existing entry (preserving `unit`/`notes`); `useUpdateDefaultListItem`
  persists quantity+unit and preserves `notes`.
- `src/hooks/__tests__/useShoppingLists.test.ts` (extend): seeding carries `unit`
  from default entries.
- `src/components/molecules/__tests__/QuantitySheet.test.tsx` (new): stepper
  increments/decrements and clamps at 1; unit input edits; Save fires `onSave`
  with the trimmed unit and closes.
- `src/components/molecules/__tests__/ListItemRow.test.tsx` (extend): renders
  `"2 lbs"` with a unit and `"×2"` without; when `onQuantityClick` is set the
  quantity is tappable and tapping it fires the callback **without** `onToggle`;
  read-only when absent.
- `src/components/molecules/__tests__/GroceryListItem.test.tsx` (extend): tapping
  the quantity opens `QuantitySheet`; saving calls `onQuantityChange`; the aisle
  picker still works independently.
- `src/components/organisms/__tests__/DefaultListEditor.test.tsx` (extend):
  edit-quantity flow opens the sheet and calls the update mutation.
- `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx` (extend): rows
  receive `unit`; quantity edit triggers the list-item update.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — flows:
   - Shopping list: tap an item's quantity, set `3` + `cans`, save → `3 cans`,
     persists across reload; tapping quantity never toggles checked state.
   - Add an item already on the list (different casing) → existing row's count
     goes up by one, no duplicate row appears.
   - Default list: set a quantity/unit, then create a new list from default →
     seeded item carries quantity **and** unit.
   - Recipe import with two ingredients normalizing to the same name → one row
     with quantity 2 (dedup-increment via the shared add path).
   - Upgrade path: an install created before this change still loads (existing
     list items render `×N`, no crash from a missing `unit`).

## Out of scope / Follow-ups (new backlog item)

- **Carry recipe-parsed quantity & unit into added items.** `normalizeIngredient`
  already returns `quantity`/`unit`; `RecipeImporter` currently discards them.
  Wiring them through means extending `useAddListItem`/`useAddDefaultListItem` to
  accept an optional `{ quantity, unit }` and deciding merge semantics when the
  item is also a duplicate (set vs. add, and what to do on a unit mismatch like
  "cups" vs "lbs"). That decision space is large enough to stand alone → add
  **`tasks/backlog--recipe-import-quantities.md`** and a PLAN.md backlog entry.
  The dedup-increment in this task already applies to recipe import for free.
- **Decimal/fractional quantities** (`1.5 lbs`) — stepper is integer-only, min 1.
- **A unit picker / canonical unit list** — unit stays free text.
- **Editing `notes`** on default entries — preserved on write, not edited here.
- **Specifying quantity at add-time** — add form stays a single fast-entry field
  defaulting to qty 1; quantity is set via edit (or duplicate-add increment).
</content>
</invoke>
