---
step: 6
substep: 1
status: implementing
class: standard
e2e_required: true
clarifications: |
  Aisle picker badge removed from item rows — add "user can categorize uncategorizable items" to backlog; okay regression for now.
  Header store data reads stores[0] as placeholder — acceptable.
  Left/got count: useListItems lifted to route level to avoid duplicate query — agreed.
---

# Task: Implement Shoop.dc.html Design

**Source:** https://claude.ai/design/p/3074cf94-0541-48cc-a8dd-7fc3e53f2510?file=Shoop.dc.html

## Status

Pending user sign-off on open questions (see bottom of file).

## Scope

Visual overhaul of the shopping list detail view and its shared components. Route structure (lists → detail), all data/hook logic, and IndexedDB schema are unchanged. The design file shows the `ShoppingListDetailRoute` view.

---

## Steps

### 1. `index.html` — theme-color

- [ ] Add `<meta name="theme-color" content="#084887">` so the mobile browser chrome matches the header gradient.

### 2. `src/index.css` — color tokens

- [ ] Change `--color-background` and `--color-surface` from `#FAFBFF` → `#f5f7fb` (subtle blue-gray matching the design's screen background)

### 3. `src/components/templates/AppShell.tsx` — bottom nav

- [ ] Background: `bg-primary` → `bg-[#0a1b2e]` (dark navy)
- [ ] Height: `h-16` → `h-[78px]`
- [ ] Active: `text-[#f9a23b]` (no bg tint)
- [ ] Inactive: `text-white/50`

### 4. `src/utils/aisleColor.ts` — new utility

> **Structure note:** `src/utils/` does not exist yet and is not listed in CLAUDE.md's directory structure. Creating it is an accepted, deliberate deviation (sign-off given) — `aisleColorFor` is pure presentation logic, not a `services/` utility.

- [ ] Create pure function `aisleColorFor(label: string): { color: string; tint: string }`
- [ ] Keyword-match aisle labels to color/tint pairs:

| Label keywords             | Color     | Tint      |
| -------------------------- | --------- | --------- |
| produce, fruit, veg        | `#16a34a` | `#e7f6ec` |
| dairy, egg                 | `#2563eb` | `#e8eefc` |
| cereal, breakfast, granola | `#ea7a07` | `#fdefe0` |
| pasta, sauce               | `#dc2626` | `#fce9e9` |
| baking, coffee, oil, sugar | `#7c3aed` | `#f0eafc` |
| chip, snack, cracker       | `#db2777` | `#fce8f1` |
| frozen                     | `#0891b2` | `#e4f4f8` |
| bread, bakery              | `#d97706` | `#fcefdd` |
| meat, seafood, deli        | `#be123c` | `#fbe7ec` |
| household, cleaning, paper | `#475569` | `#eef1f5` |
| fallback                   | `#64748b` | `#eef1f5` |

No DB changes — colors are view-layer only.

### 5. `src/hooks/useStores.ts` — new hook

- [ ] Simple `useQuery` reading `db.getAll('stores')`
- [ ] Needed by the header to show store name and address

### 6. `src/components/molecules/AisleGroup.tsx` — redesign

Props change:

```ts
// Before
{ label, number?, children, isSpecial? }
// After
{ label, number?, color, tint, count, children }
```

Visual change: `<section>` with sticky text header → white card with 5px colored left border.

Structure:

```
<div card, border: 1px solid #eef1f7, border-left: 5px solid color, border-radius: 16px,
     box-shadow: 0 2px 10px rgba(15,23,42,.05)>
  <div header row>
    <span dot (color) />
    <span UPPERCASE label (color) />
    <span count badge (tint bg, color text) />
  </div>
  {children}   ← each child separated by border-top: 1px solid #f1f4f9
</div>
```

- [ ] Add `popIn`, `rowIn`, and `fadeIn` keyframes to global CSS and apply `popIn` on card mount

### 7. `src/components/molecules/GroceryListItem.tsx` — redesign

Props change:

```ts
// Before
{ name, quantity, checked, onToggle, onDelete, aisleLabel, isAnalyzing, aisles, currentAisleId, onAisleChange }
// After
{ name, color, checked?, onToggle?, onDelete? }
```

Unchecked row: circle outline toggle (border: 2px solid `color`) + item name + `×` remove button (SVG).

**Note:** `aisleLabel`, `isAnalyzing`, `aisles`, `currentAisleId`, `onAisleChange`, and `quantity` are dropped. The aisle picker badge is removed from the item row. `AislePickerSheet.tsx` stays in the codebase for future re-wiring.

**Known regressions (both added to PLAN.md backlog):**

- Quantity is no longer displayed or editable on the row, though it remains in the data model. → backlog: "Edit item quantity on the shopping list".
- Items can no longer be re-categorized from the row. → backlog: "Let user categorize uncategorizable items".

### 8. `src/components/organisms/ShoppingListBuilder.tsx` — updates

- [ ] Import `aisleColorFor`, pass `color`/`tint`/`count` to each `<AisleGroup>`
- [ ] Pass `color` to each `<GroceryListItem>`
- [ ] **Uncategorized group:** still rendered as a normal `<AisleGroup>` using `aisleColorFor`'s slate fallback (the `isSpecial` prop is removed in Step 6, so it becomes a standard card)
- [ ] **Remove dead aisle-mutation wiring** now unused: `useUpdateItemAisle`/`updateItemAisle` and the `aisles`/`currentAisleId`/`onAisleChange` props passed to `GroceryListItem`. Keep `useItems`/`itemById` (still needed for item names).
- [ ] Replace `<AisleGroup label="Done">` with a flat "Got it" section:
  - "GOT IT · N" uppercase muted label
  - Gray-background container (`#eef1f6`)
  - Inline rows: filled colored circle + checkmark SVG + strikethrough name
  - Checked items sorted by aisle order

### 9. `src/components/organisms/AddItemForm.tsx` — redesign

Visual change only; functional logic unchanged.

- [ ] Replace `<Input> + <Button>Add</Button>` layout with a white card (`box-shadow: 0 8px 24px -8px rgba(8,72,135,.4); border: 1px solid #eaeef6; border-radius: 16px`)
- [ ] Plus SVG icon (`#084887`) on left, full-width input, no visible submit button
- [ ] Form still submits on Enter via `onSubmit`

### 10. `src/routes/ShoppingListDetailRoute.tsx` — layout overhaul

New structure:

```
<div min-h-full flex flex-col>
  <header sticky top-0 z-20, background: linear-gradient(140deg, #084887 0%, #0a63bd 55%, #1178d6 100%)>
    store chip (icon + name + "City, ST · N aisles mapped")
    "Your list" + "{left} left · {got} got" badge
  </header>

  <div px-4 -mt-5 z-10>        ← add bar overlaps header
    <AddItemForm />
  </div>

  <div flex-1 px-4 pt-5 pb-24> ← scrollable list content
    <ShoppingListBuilder />
  </div>
</div>
```

Data sources for header:

- Store name + address: `useStores().data?.[0]` (only one store seeded; active-store selector is a future backlog item). Render the raw `address` string as-is — the schema stores `address` as a single free-text field, so do **not** attempt to derive "City, ST". Header text: `{address} · {N} aisles mapped`.
- Aisle count: `useAisles().data.length`
- Left/got counts: call `useListItems(listId)` at the route level for the header. TanStack Query dedupes by query key, so this shares the same cache entry as `ShoppingListBuilder` — there is no extra fetch. Either pass counts down as props or let each component read the shared cache; passing props is fine for keeping the header self-contained.

### 11. Tests

- [ ] Update `AisleGroup.test.tsx` — new required props
- [ ] Update `GroceryListItem.test.tsx` — props signature change
- [ ] Update `ShoppingListBuilder.test.tsx` — new rendering
- [ ] Check `AppShell.test.tsx` — update any nav color/height assertions

---

## Out of Scope

- `ShoppingListsRoute` (list picker screen) — not shown in design, leave as-is
- `ShoppingListCard` — unchanged
- `AislePickerSheet` — stays in codebase, not triggered from item rows right now
- `DefaultListRoute`, `SettingsRoute` — placeholder stubs, unchanged
- No DB migrations, no schema changes

---

## Open Questions (Pending User Input)

1. **Aisle picker badge** — removed from item rows in this design. OK as a known regression for now, or should it live somewhere (e.g., accessible via long-press)?
   Answer: add "user can categorize uncategorizable items" to backlog; okay regression for now.
2. **Header store data** — reading `stores[0]` since active-store concept doesn't exist yet. Acceptable placeholder?
   Answer: yes
3. **Left/got count** — lifting `useListItems` to the route level to avoid a duplicate query in ShoppingListBuilder. Agreed?
   Answer: Yes
