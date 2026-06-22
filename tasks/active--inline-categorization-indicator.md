# Task: Inline "actively categorizing" indicator

## Problem

When an unchecked list item has no aisle for the active store, the UI shows a
single pulsing `…` badge. That badge means **two different things** that the user
cannot tell apart:

1. **Actively categorizing** — the aisle matcher is still working on the item
   (the worker model is loading, or a `classify()` call is in flight). An aisle
   may be assigned at any moment.
2. **Uncategorized / unable to categorize** — the matcher has run and produced no
   confident aisle. The item has *settled*; it needs a manual pick to move out of
   the Uncategorized group.

This conflation was called out explicitly as out of scope in
`tasks/complete--manual-categorize-uncategorized.md` ("Distinguishing 'actively
analyzing' from 'settled-but-uncategorized' would need an inference-state
flag/field"). This task adds that distinction.

### Root cause

`src/components/organisms/ShoppingListBuilder.tsx` (`renderListItem`, line ~78):

```ts
const isAnalyzing = !li.checked && (!aisleId || !aisleById.has(aisleId));
```

Every unchecked item without a valid aisle is `isAnalyzing = true`, regardless of
whether the matcher is still working on it. `GroceryListItem` then renders the
pulsing `…` badge (made tappable by the manual-categorize task) for both states.

The information needed to tell the states apart — "is a classification currently
in flight / queued for this item?" — is **ephemeral runtime state owned by
`AddItemForm`** (the sole consumer of `useAisleMatcher`, per ADR-0013). It is not
derivable from persisted IndexedDB data, which only records "has a location or
not." `ShoppingListBuilder` (a sibling organism under `ShoppingListDetailRoute`)
has no access to it today.

## Relevant ADRs

- **ADR-0004** (Zustand for ephemeral UI state / TanStack Query for persistent
  data): the "actively categorizing" set is session-only ephemeral UI state, so
  it belongs in a Zustand slice in `src/stores/`. This is the **first** Zustand
  slice in the project (the dir is specced in CLAUDE.md but empty), so it
  establishes the pattern; it must not write to IndexedDB and must not import
  from `hooks/`.
- **ADR-0013** (web-worker aisle inference): `useAisleMatcher`'s public API
  (`prime`, `classify`, `isReady`) and its status as the sole matcher consumer
  via `AddItemForm` are unchanged. We instrument the *call sites* in
  `AddItemForm`, not the matcher.
- **ADR-0009 / ADR-0011** (on-demand model, layered matching): low-confidence
  items still land in Uncategorized — unchanged. We only add a visual distinction
  between "in progress" and "settled there."

No ADR is contradicted. **No new ADR required** — ADR-0004 already mandates
Zustand for exactly this kind of state; no new architectural boundary is crossed.

## Dependency note (requires approval)

`zustand` is **not yet installed** (`package.json` has no zustand entry). Per
CLAUDE.md, changes to `package.json`/`package-lock.json` require explicit
approval. **Before implementation, confirm adding `zustand`** (`npm install
zustand`). If declined, the fallback is a React Context provider wrapping
`ShoppingListDetailRoute` (see "Alternative considered"); the rest of the plan is
unchanged in shape.

## Approach

Three pieces:

- **A.** A Zustand slice tracking the set of item ids currently being categorized.
- **B.** `AddItemForm` records begin/end around its classification lifecycle.
- **C.** `ShoppingListBuilder` + `GroceryListItem` render three distinct states:
  *categorizing* (spinner), *uncategorized-settled* (tappable Categorize badge),
  *has aisle* (tappable aisle badge — unchanged).

### A. Categorization status store

`src/stores/useCategorizationStore.ts` (new)

```ts
import { create } from 'zustand';

interface CategorizationState {
  /** Item ids with a classification queued or in flight for the active store. */
  categorizingIds: Set<string>;
  begin: (itemId: string) => void;
  end: (itemId: string) => void;
}

export const useCategorizationStore = create<CategorizationState>((set) => ({
  categorizingIds: new Set(),
  begin: (itemId) =>
    set((s) => {
      if (s.categorizingIds.has(itemId)) return s;
      const next = new Set(s.categorizingIds);
      next.add(itemId);
      return { categorizingIds: next };
    }),
  end: (itemId) =>
    set((s) => {
      if (!s.categorizingIds.has(itemId)) return s;
      const next = new Set(s.categorizingIds);
      next.delete(itemId);
      return { categorizingIds: next };
    }),
}));
```

- New `Set` identity on every change so selector subscribers re-render.
- `begin`/`end` are idempotent (no-op + same-reference return when membership
  wouldn't change), avoiding spurious renders.
- Ephemeral by design: a reload starts empty, which is correct — nothing is in
  flight after a reload.

### B. Instrument the lifecycle in `AddItemForm`

`src/components/organisms/AddItemForm.tsx`

Read the actions once: `const { begin, end } = useCategorizationStore();` (select
the actions, not the set, so the form doesn't re-render on set changes).

An item id enters the set when a classification is queued/started for it and
leaves when that classification **settles** (resolves, with or without an aisle).
Use `.finally()` so the id is always released.

1. **On-add path** (`handleSubmit` → `mutate` `onSuccess`): currently classify
   only fires when `isReady`. Extend so the item is marked categorizing as soon
   as it is added needing a location — this covers the **model-load window**
   (worker still loading) so the item shows the spinner immediately rather than
   flashing "uncategorized" until the worker is ready:

   ```ts
   if (result.newItemId && activeStore && !locatedItemIds.has(result.newItemId)) {
     const newItemId = result.newItemId;
     // Only claim "categorizing" if the matcher actually has something to work
     // with; with no candidates prime() is a no-op and the item is genuinely
     // uncategorized (avoids a stuck spinner that never resolves).
     if (isReady || candidates.length > 0) {
       begin(newItemId);
       if (isReady) {
         classify(name, aisles ?? [])
           .then((aisleId) => {
             if (aisleId)
               upsertLocation.mutate({ itemId: newItemId, storeId: activeStore.id, aisleId, auto: true });
           })
           .finally(() => end(newItemId));
       }
       // else: leave it in the set; the deferred reclassify loop below claims
       // and releases it once the worker is ready.
     }
   }
   ```

2. **Deferred reclassify loop** (the `isReady` effect): wrap each item's
   classify in begin/finally-end. This both classifies items queued during the
   load window and **settles** items the matcher can't place (they leave the set
   and become uncategorized-settled):

   ```ts
   for (const item of unlocated) {
     begin(item.id);
     classify(item.name, aisles ?? [])
       .then((aisleId) => {
         if (aisleId)
           upsertLocation.mutate({ itemId: item.id, storeId: activeStore.id, aisleId, auto: true });
       })
       .finally(() => end(item.id));
   }
   ```

   Duplicate `begin()` for an item already queued on-add is a harmless no-op.

3. **Remove the aggregate banner.** The existing `showClassifying`
   "Classifying…" `<p>` (and its derived state) is superseded by the per-item
   spinners and should be removed to avoid a redundant double indicator.

4. **Cleanup on unmount.** On `AddItemForm` unmount, clear any ids it still owns
   so a stuck "loading forever" worker can't leave permanent spinners after the
   user navigates away. Simplest: an `useEffect(() => () => { /* end all ids
   this form began */ }, [])`. Track the form's own began-ids in a `useRef<Set>`
   and `end()` each on unmount. (Keeps the store free of teardown logic.)

> The model-load window relies on `isReady` eventually flipping. If the worker
> never becomes ready (e.g. it fails to load), items begun on-add stay
> spinning until unmount cleanup. This matches today's behavior (the old
> `…`/`Classifying…` indicator was equally indefinite) and is acceptable; a
> worker-load timeout is out of scope (noted below).

### C. Render three states

`src/components/atoms/Spinner.tsx` (new atom — no business logic, per CLAUDE.md)

- Small spinner sized to sit in the badge slot. Use FontAwesome `faSpinner` with
  Tailwind `animate-spin` (FontAwesome is already the icon system — ADR-0007), or
  a CSS border-spinner `<span>`; either is fine. Props: `className?`,
  `aria-label?` (default `"Loading"`), `role="status"`.

`src/components/molecules/GroceryListItem.tsx`

- Replace the single `isAnalyzing` prop with an explicit state. Add
  `isCategorizing?: boolean`. Keep `aisleLabel`, `aisles`, `currentAisleId`,
  `onAisleChange`.
- Badge slot for **unchecked** items, in priority order:
  1. `isCategorizing` → render `<Badge variant="muted"><Spinner /></Badge>`,
     `aria-label="Categorizing item"`, **non-interactive** (no `onClick`, no
     picker). It's a status, not an action.
  2. `aisleLabel` → tappable aisle badge → opens picker. **Unchanged**
     (`aria-label="Change aisle: …"`).
  3. neither → **uncategorized-settled** affordance: a tappable badge that opens
     the picker, `aria-label="Categorize item"`. Use a clearly non-busy visual
     (e.g. a tag icon or the text "Categorize") so it reads as an actionable
     "needs your input" state, distinct from the spinner. Reuses the existing
     `sheetOpen` + `AislePickerSheet` block (`currentAisleId=''` → nothing
     preselected, which is correct).
- Checked items: unchanged (non-interactive).
- The `stopPropagation` on the tappable badge stays so tapping it never toggles
  the item.

`src/components/organisms/ShoppingListBuilder.tsx`

- Subscribe to the set: `const categorizingIds = useCategorizationStore((s) =>
  s.categorizingIds);`
- In `renderListItem`, replace the `isAnalyzing` derivation:

  ```ts
  const hasAisle = !!aisleId && aisleById.has(aisleId);
  const isCategorizing = !li.checked && !hasAisle && categorizingIds.has(li.item_id);
  ```

  Pass `isCategorizing` down. When `!isCategorizing && !hasAisle` and the item is
  unchecked, `GroceryListItem` renders the uncategorized-settled affordance from
  the same `aisles`/`onAisleChange`/`currentAisleId` props already passed.
- The `onAisleChange` → `upsertLocation.mutate({ itemId, storeId, aisleId })`
  manual write is unchanged (no `auto` flag → unconditional, manual pick wins).

## Files to change

| File | Change |
| --- | --- |
| `package.json` | **(gated on approval)** add `zustand` dependency. |
| `src/stores/useCategorizationStore.ts` | **new** — ephemeral set of categorizing item ids + `begin`/`end`. |
| `src/components/atoms/Spinner.tsx` | **new** atom — inline spinner for the badge slot. |
| `src/components/molecules/GroceryListItem.tsx` | three-state badge: spinner (categorizing) / aisle / Categorize (settled). |
| `src/components/organisms/ShoppingListBuilder.tsx` | derive `isCategorizing` from the store; pass it down. |
| `src/components/organisms/AddItemForm.tsx` | `begin`/`end` around the two classify sites; cover load window; unmount cleanup; remove aggregate banner. |

`ShoppingListDetailRoute.tsx` needs no change (no provider with the Zustand
approach).

## Tests

- `src/stores/__tests__/useCategorizationStore.test.ts` (new)
  - `begin` adds an id; `end` removes it; both idempotent.
  - the `Set` reference changes on real mutations and is stable on no-ops.
- `src/components/atoms/__tests__/Spinner.test.tsx` (new)
  - renders with `role="status"` and an accessible label.
- `src/components/molecules/__tests__/GroceryListItem.test.tsx` (extend)
  - `isCategorizing` (unchecked): spinner badge shown, `aria-label="Categorizing
    item"`, **no** picker opens on tap, `onToggle` still fires from the row.
  - settled-uncategorized (unchecked, no `aisleLabel`, not categorizing, with
    `aisles` + `onAisleChange`): "Categorize" badge is tappable, opens the sheet,
    selecting an aisle calls `onAisleChange`; tapping it does **not** call
    `onToggle`.
  - has `aisleLabel` (not categorizing): tappable "Change aisle" badge —
    unchanged.
  - checked: no interactive badge.
- `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx` (extend)
  - item id present in the store's `categorizingIds` → spinner rendered for it.
  - unchecked item with no location and **not** in the set → "Categorize"
    affordance (settled), not a spinner.
  - located item → aisle badge. (Mock/seed `useCategorizationStore`.)
- `src/components/organisms/__tests__/AddItemForm.test.tsx` (extend)
  - on add of an item needing a location with matcher ready: `begin(itemId)` then
    `end(itemId)` after classify resolves (spy the store actions).
  - deferred reclassify loop: `begin`/`end` called per unlocated item; an item
    that classifies to no aisle still gets `end` (→ becomes settled).
  - the aggregate "Classifying…" banner no longer renders.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — add an item and confirm: while the matcher works the item
   shows the **spinner**; it then either moves into an aisle group (classified)
   or settles into Uncategorized showing the tappable **Categorize** badge (not a
   spinner). Tapping Categorize opens the picker; the chosen aisle sticks (no late
   classifier revert — the `auto` guard from the prior task still holds).

## Alternative considered (if `zustand` is declined)

Wrap `ShoppingListDetailRoute` in a `CategorizationStatusProvider` (React Context
holding a `useState<Set<string>>` + `begin`/`end`). `AddItemForm` and
`ShoppingListBuilder` consume it. No new dependency, but it deviates from
ADR-0004's explicit choice of Zustand over context for ephemeral state, so it
would warrant a short note in the ADR record. Component/lifecycle logic is
otherwise identical.

## Out of scope

- Persisting categorization status (a schema field / `DB_VERSION` bump). The
  state is ephemeral; persisting it would leave stale "pending" rows after a
  mid-classify reload. Rejected.
- A worker-load timeout / failure state for the matcher (would bound the
  load-window spinner). Separate reliability task.
- Changing matcher accuracy, thresholds, or the lexical/semantic layering
  (ADR-0011) — untouched.
- Any change to checked-item rendering or the Done group.
