# Recipe import: list-item quantity control in the preview

## Goal

Replace the recipe-import preview's per-row free-text **unit input** with the same
**quantity control regular list items use** — a tappable `×N` chip that opens the
shared `QuantitySheet` (integer stepper clamped at ≥1, plus an optional unit
field). Each row defaults to **quantity 1, no unit**, exactly like a manual add or
a normal list item, and the user can tap to bump the count and/or add a unit. The
chosen quantity (and unit) is carried into the committed list/default-list item.

## Current behavior (what we're changing)

- `RecipeImporter.tsx` renders each normalized ingredient in a `SelectionList`
  whose `renderAccessory` is a free-text unit `Input` (`w-20`, backed by a
  `<datalist>` of `UNIT_SUGGESTIONS`). State is `units: string[]`.
- `commit()` passes only `{ name, unit? }` to `useAddListItem` / `useAddDefaultListItem`.
- Those hooks **hardcode `quantity: 1`** for new rows (and `+1` on a duplicate
  resolve). There is no path to set an import-time quantity.

The list-item quantity UX already exists and is the thing to reuse:
- `ListItemRow.tsx` — renders the tappable quantity button (`formatQuantity`,
  dotted underline) via the `onQuantityClick` prop.
- `QuantitySheet.tsx` — bottom sheet with the `±` stepper (min 1) + optional unit,
  driven by `onSave(quantity, unit)` callbacks.
- `GroceryListItem.tsx` — the reference wiring: tappable quantity opens
  `QuantitySheet`, save calls `onQuantityChange`.

## ADR check

- **ADR-0021** (recipe-ingredient normalization) governs this surface. It mandates:
  no quantity/unit **extraction from the ingredient string**, default to ×1, and an
  optional unit control in the preview. This change **keeps all three**: nothing is
  parsed from the string, rows still default to ×1, and we're swapping the unit
  control for a richer quantity+unit control. The quantity is **user-set in the
  preview**, not extracted — so this *extends* ADR-0021's "user sets it in the
  preview" intent rather than contradicting it. No new ADR required; no `DB_VERSION`
  bump (no schema/persistence shape change).
- **ADR-0005** (atomic design): we reuse the existing `QuantitySheet` molecule and
  `formatQuantity` util; no new components, no layering violations.

## Design

### 1. `RecipeImporter.tsx` (organism) — swap the accessory + add a sheet

- **State:** replace `units: string[]` with two parallel arrays kept aligned with
  `normalized`:
  - `quantities: number[]` — initialised to `1` per row.
  - `units: string[]` — initialised to `''` per row.
  - `editingIndex: number | null` — which row's `QuantitySheet` is open (`null` =
    closed). Reset alongside `checked`/`units` in the existing `useEffect`.
- **Accessory:** replace the unit `Input` with a tappable quantity button mirroring
  `ListItemRow`'s styling:
  ```tsx
  renderAccessory={(_, index) => (
    <button
      type="button"
      className="text-sm font-bold tabular-nums text-text-muted underline decoration-dotted underline-offset-2"
      onClick={() => setEditingIndex(index)}
      aria-label={`Quantity for ${normalized[index].name}`}
    >
      {formatQuantity(quantities[index] ?? 1, units[index])}
    </button>
  )}
  ```
  (Accessory clicks already don't toggle selection — `SelectionList` renders it as a
  sibling outside the toggle button.)
- **Sheet:** render a single `QuantitySheet` when `editingIndex !== null`, as a
  sibling of the list (same pattern as `GroceryListItem`):
  ```tsx
  {editingIndex !== null && (
    <QuantitySheet
      quantity={quantities[editingIndex] ?? 1}
      unit={units[editingIndex] ?? ''}
      onSave={(q, u) => { setQuantity(editingIndex, q); setUnit(editingIndex, u); }}
      onClose={() => setEditingIndex(null)}
    />
  )}
  ```
  Add a `setQuantity(index, value)` updater mirroring the existing `setUnit`.
- **Remove** the `<datalist>` block, `UNIT_DATALIST_ID`, and the direct `Input`
  import if no longer used. Decide unit-suggestions handling — see §3.
- **`commit()`:** include the per-row quantity:
  ```ts
  .map((ingredient, index) => ({
    ingredient,
    quantity: quantities[index] ?? 1,
    unit: units[index]?.trim() || undefined,
  }))
  ```
  and pass `quantity` to both `addDefaultItem.mutateAsync` and
  `addListItem.mutateAsync`.

### 2. `useListItems.ts` / `useDefaultList.ts` (hooks) — accept an optional quantity

The preview can now choose a quantity, so the add hooks must accept one. Keep it
**optional and backward-compatible** (manual adds and existing callers are
unchanged).

- `AddListItemInput` / `AddDefaultListItemInput`: add `quantity?: number`.
- New-row branch: `quantity: quantity ?? 1` (was `1`).
- **Dedup key becomes `(item_id, unit)`, not `item_id` alone** (user decision):
  - The `existing` lookup matches the same item **only when the unit also matches**
    (`existing.unit === (unit ?? '')`). On a match → `existing.quantity + (quantity ?? 1)`
    (sum). On no match → fall through and **create a new row** for that item with the
    differing unit.
  - This drops the old "adopt incoming unit only when none is set" clobber-guard in
    the increment branch — that branch now only runs when the units are already equal.
  - **Backward-compatible for the manual path:** manual adds are always unitless
    (`unit === ''`), so two manual `milk` adds still match (`'' === ''`) and sum,
    exactly as today. The new "separate row" path is only reachable when an
    import row carries a unit that differs from an existing row's.
- **Cross-cutting note:** this permits two rows of the *same catalog item* with
  different units in one list/default-list (e.g. `Flour ×2 cups` and `Flour ×1 bag`).
  The catalog `items` entry is still shared (one canonical item; `resolveItem`
  unchanged) — only the list/default rows split. Verify `ShoppingListBuilder` /
  `DefaultListEditor` render two such rows cleanly (they key on the row `id`, so this
  should already hold) and that aisle classification (keyed on `item_id`) is
  unaffected.
- Validation: guard a non-positive/NaN quantity to `1` (or clamp `Math.max(1, …)`)
  so the stepper's invariant holds at the persistence layer too.

### 3. Unit suggestions (`UNIT_SUGGESTIONS`) — keep the datalist affordance

`QuantitySheet`'s unit field is a plain `Input` with no suggestions; the current
preview has a `<datalist>`. To preserve that affordance and keep `UNIT_SUGGESTIONS`
in use:

- **Recommended:** add an optional `unitSuggestions?: readonly string[]` prop to
  `QuantitySheet`. When provided, render a `<datalist>` and wire the unit input's
  `list`. Non-breaking for `GroceryListItem` / `DefaultListEditor` (they omit it).
  `RecipeImporter` passes `UNIT_SUGGESTIONS`.
- **Alternative:** drop suggestions in the import preview and remove the now-unused
  `UNIT_SUGGESTIONS` export from `normalizeIngredient.ts`. Simpler, but loses the
  curated unit hints on the one surface that benefits most.

## Tests

- **`RecipeImporter.test.tsx`** (update — the unit `Input` is gone):
  - Default commit assertions gain `quantity: 1` for every
    `mockAddListItem` / `mockAddDefault` payload.
  - Rewrite "carries a unit set in the preview": tap the `Quantity for Flour`
    button → `QuantitySheet` opens → bump quantity via "Increase quantity",
    type a unit, "Save" → assert the commit carries the new `quantity` and `unit`.
  - Add a case asserting an untouched row commits `{ quantity: 1, unit: undefined }`.
- **`useListItems` / `useDefaultList` tests:** add coverage that a provided
  `quantity` lands on a new row; that a same-name **same-unit** resolve sums the
  quantities (and increments by 1 when `quantity` is omitted, i.e. the manual path);
  and that a same-name **different-unit** add creates a **second row** rather than
  merging.
- **`QuantitySheet.test.tsx`:** if §3 recommended path is taken, add a case that
  `unitSuggestions` renders `<option>`s and wires the input's `list`.
- E2E (`e2e/recipe-import.spec.ts`): if it asserts on the unit input, update the
  selector to the quantity chip + sheet flow. Run `npm run test:e2e` (not covered by
  `validate`).

## Out of scope / non-goals

- No quantity/unit **extraction** from ingredient strings — `normalizeIngredient`
  stays name-only (ADR-0021).
- No schema / `DB_VERSION` change.
- No change to the manual add flow or the in-list `QuantitySheet` wiring.

## Files touched

- `src/components/organisms/RecipeImporter.tsx` (accessory + sheet + commit)
- `src/hooks/useListItems.ts` (optional `quantity`)
- `src/hooks/useDefaultList.ts` (optional `quantity`)
- `src/components/molecules/QuantitySheet.tsx` (optional `unitSuggestions`, §3 rec.)
- `src/utils/normalizeIngredient.ts` (only if §3 alternative: drop `UNIT_SUGGESTIONS`)
- Tests: `RecipeImporter.test.tsx`, `useListItems`/`useDefaultList` tests,
  `QuantitySheet.test.tsx`, `e2e/recipe-import.spec.ts`

## Validation

- `npm run validate` (typecheck + lint + unit) green.
- `npm run test:e2e` green (manually, per CLAUDE.md — not in `validate`).
- Manual: import a recipe → each row shows `×1` → tap → stepper opens at 1 →
  bump + add unit → save → chip reflects it → commit lands the chosen quantity/unit.

## Decisions (resolved with the user)

- **Duplicate-resolve:** dedup on `(item_id, unit)`. Same name + same unit → **sum**
  the chosen quantities; same name + different unit → **separate row**. Manual
  (unitless) adds are unaffected and still sum.
- **Unit suggestions:** **extend `QuantitySheet`** with an optional
  `unitSuggestions` prop so the import preview keeps the curated `UNIT_SUGGESTIONS`
  datalist; other callers omit it.
