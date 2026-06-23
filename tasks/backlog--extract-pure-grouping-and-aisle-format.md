# Task: Extract pure grouping + aisle-label formatting out of components

## Problem

The single highest-leverage testability problem in the component tree is that
**pure data transforms are trapped inside organisms**, so every test of that
logic must render the component and mock its hooks.

Two concrete cases:

1. **Aisle bucketing** lives inline in `ShoppingListBuilder.tsx:46-72`: given the
   list items, the per-store `item_id → aisle_id` map, and the aisle map, it
   produces (a) aisle buckets sorted by `sort_order`, (b) an `uncategorized`
   list, and (c) a `checked` list. This is a pure function, but
   `ShoppingListBuilder.test.tsx` is ~330 lines and mocks **8 hooks** just to
   exercise it through the DOM.

2. **Aisle-label formatting** is duplicated across three components with three
   *different* behaviors:
   - `AisleGroup.tsx:9` → `Aisle ${number} — ${label}` (no guard on `number`)
   - `AislePickerSheet.tsx:48` → guards with `/^\d+$/.test(number)` before
     prefixing `Aisle`
   - `AisleCard.tsx:18` → `Aisle ${aisle.number}` (number only, no label)

   Three call sites, three formats, no single source of truth.

This directly serves the stated goals: **minimal-to-no-mock unit tests** (pure
functions tested with plain inputs/outputs) and **readability/reusability** (one
formatter instead of three inline variants).

### Current state

- `src/components/organisms/ShoppingListBuilder.tsx` — bucketing logic inline in
  the component body (`:46-72`), plus a `renderListItem` closure.
- No `src/lib/` home exists yet for component-facing pure helpers; `APP_VERSION`
  lives at `src/lib/appVersion.ts`, so `src/lib/` is the established location.
- `src/db/schema.ts` → `Aisle = { id, store_id, number, label, sort_order }`,
  `ListItem = { id, list_id, item_id, quantity, checked, added_from_default }`.

## Relevant ADRs

- **ADR-0005 (atomic design):** organisms may hold business logic, but pulling
  the *pure* transform into `src/lib/` keeps the organism thin and the logic
  independently testable. No layer boundary is crossed — `src/lib/` helpers are
  framework-free and import only schema types.
- **ADR-0015 (store-agnostic items / active store):** the bucketing resolves each
  list item's aisle from the **active store's** `item_locations` map. The
  extracted function must take that resolution as an input (`aisleByItem`), not
  reach for a store itself — preserving the store-agnostic list model.

No ADR is contradicted. **No new ADR required** — this is a refactor that
relocates existing pure logic; behavior is unchanged.

## Approach

### 1. `src/lib/formatAisleLabel.ts` (new)

```ts
import type { Aisle } from '@/db/schema';

/**
 * Canonical display label for an aisle. A numeric aisle gets the
 * "Aisle N — Label" form; a named section (non-numeric or empty `number`)
 * shows just its label. Single source of truth for all aisle labelling.
 */
export function formatAisleLabel(aisle: Pick<Aisle, 'number' | 'label'>): string {
  if (aisle.number && /^\d+$/.test(aisle.number)) {
    return `Aisle ${aisle.number} — ${aisle.label}`;
  }
  return aisle.label;
}
```

- Adopt the **guarded** behavior (the `AislePickerSheet` variant) everywhere —
  it is the most correct: a non-numeric `number` (e.g. a named section) should
  not render `Aisle <text>`.
- `AisleCard` currently shows only `Aisle ${number}` inside a `Badge`; keep its
  badge as-is (the badge is a compact tag, not the full label) — `AisleCard` is
  **out of scope** for this formatter unless we decide the badge should read the
  full label. Document that choice in the PR; do not silently change it.

### 2. `src/lib/groupListItemsByAisle.ts` (new)

```ts
import type { Aisle, ListItem } from '@/db/schema';

export interface AisleBucket {
  aisle: Aisle;
  listItems: ListItem[];
}

export interface GroupedListItems {
  buckets: AisleBucket[];      // sorted by aisle.sort_order
  uncategorized: ListItem[];   // unchecked, no resolvable aisle for this store
  checked: ListItem[];         // checked items, original order
}

export function groupListItemsByAisle(
  listItems: ListItem[],
  ctx: { aisleById: Map<string, Aisle>; aisleByItem: Map<string, string> },
): GroupedListItems { /* move logic from ShoppingListBuilder.tsx:46-72 */ }
```

- Move the bucketing/sorting verbatim from the organism. Keep the exact
  semantics: an item whose resolved `aisle_id` is empty **or** absent from
  `aisleById` goes to `uncategorized`; buckets sort by `sort_order`.

### 3. Rewire the components

- **`ShoppingListBuilder.tsx`**: build `aisleById`/`aisleByItem` from hooks as
  today, then call `groupListItemsByAisle(...)`. Render `buckets`,
  `uncategorized`, `checked`. The organism keeps only hook calls + mapping to
  `AisleGroup`/`GroceryListItem`.
- **`AisleGroup.tsx`** and **`AislePickerSheet.tsx`**: replace the inline label
  expressions with `formatAisleLabel(aisle)`. (Note: `AisleGroup` currently takes
  `label`/`number` as separate props — either pass the formatted string in from
  the organism, or change `AisleGroup` to accept an `Aisle`. Prefer passing the
  pre-formatted `headerText` so `AisleGroup` stays a dumb presentational
  molecule; the organism owns the formatter call.)

## Files to change

| File | Change |
| --- | --- |
| `src/lib/formatAisleLabel.ts` | **New** pure formatter. |
| `src/lib/groupListItemsByAisle.ts` | **New** pure grouping function + exported types. |
| `src/components/organisms/ShoppingListBuilder.tsx` | Replace inline bucketing with `groupListItemsByAisle`; pass `formatAisleLabel` output to `AisleGroup`. |
| `src/components/molecules/AisleGroup.tsx` | Accept a pre-formatted header (or keep label/number but stop owning the format). |
| `src/components/molecules/AislePickerSheet.tsx` | Use `formatAisleLabel`. |

## Implementation checklist

- [ ] Create `src/lib/formatAisleLabel.ts`.
- [ ] Create `src/lib/groupListItemsByAisle.ts` (move logic, do not change semantics).
- [ ] Rewire `ShoppingListBuilder` to consume both helpers.
- [ ] Rewire `AislePickerSheet` (and `AisleGroup` header source) to `formatAisleLabel`.
- [ ] New zero-mock unit tests for both helpers (see below).
- [ ] Trim `ShoppingListBuilder.test.tsx` to the rendering/wiring it still owns;
      delete assertions now covered by the pure-function tests.
- [ ] `npm run validate` clean. E2E unaffected but run the shopping flow once.

## Tests

### Unit (Vitest, **no mocks, no render**)

- **`formatAisleLabel.test.ts`**: numeric number → `Aisle N — Label`; non-numeric
  number → label only; empty/undefined number → label only.
- **`groupListItemsByAisle.test.ts`**: buckets sort by `sort_order`; item with
  empty aisle id → uncategorized; item whose aisle id is missing from `aisleById`
  → uncategorized; checked items collected separately and excluded from buckets;
  multiple items in one aisle preserve order.

### Component (RTL) — `ShoppingListBuilder.test.tsx`

- Keep the higher-level "renders Done section after aisle groups" / "trash calls
  mutate" wiring tests; drop the pure-bucketing permutations now covered above.
  Net effect: fewer, thinner mocked tests.

## Out of scope

- Changing `AisleCard`'s compact badge text.
- Any change to how `item_locations` are resolved (that stays in the hooks).
- Visual/markup changes to `AisleGroup`.
