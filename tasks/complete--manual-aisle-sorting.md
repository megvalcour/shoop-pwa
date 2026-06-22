---
status: complete
class: standard
e2e_required: true
clarifications: |
  Scope = make the aisle/section list on the store detail view (/stores/:id)
  drag-and-drop reorderable. The new order is persisted by rewriting each
  aisle's existing `sort_order` prop, which is what every read path already
  sorts on.
  DnD implementation: @dnd-kit (@dnd-kit/core + @dnd-kit/sortable +
  @dnd-kit/utilities). Chosen explicitly by the user for first-class touch
  support on this mobile PWA; this is the approved package.json change.
  Out of scope: creating/deleting/renaming aisles, editing aisle number/label,
  reordering items within an aisle, multi-store concerns beyond the single
  seeded store, and any change to how the shopping/Shop views consume aisle
  order (they already read `sort_order` and benefit for free).
---

# Task: Manually sort aisles/departments (drag-and-drop in store settings)

## Problem

The store detail view (`/stores/:id`, reached from Settings → Your Stores)
lists a store's aisles/sections read-only, ordered by `Aisle.sort_order`. There
is no way to change that order. The Shop view, list builder, and every other
aisle-consuming surface already sort by `sort_order` (`useAisles` does
`.sort((a, b) => a.sort_order - b.sort_order)`), so persisting a new
`sort_order` is the single source of truth — reorder once here and the whole app
follows.

### Current state (already implemented)

- `src/db/schema.ts` → `Aisle` already has `sort_order: number`. **No schema
  change, no `DB_VERSION` bump.** Reorder is a value rewrite of existing rows.
- `src/hooks/useAisles.ts` → `useAisles(storeId)` returns that store's aisles
  sorted by `sort_order`, query key `['aisles', storeId ?? 'all']`. Reused as-is
  for reads; a sibling reorder mutation is added in the same file.
- `src/routes/StoreDetailRoute.tsx` → renders `aisles.map(a => <AisleCard … />)`
  inside a `flex flex-col gap-3`. This map is what becomes sortable.
- `src/components/molecules/AisleCard.tsx` → presentational row
  (`px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between`),
  label + `Badge`. Gets a drag-handle affordance (see Approach).
- Optimistic-mutation house style is established in `src/hooks/useListItems.ts`
  (`useToggleListItem` / `useDeleteListItem`): `onMutate` cancels queries,
  snapshots via `getQueryData`, writes via `setQueryData`, `onError` restores the
  snapshot, `onSettled` invalidates. The reorder mutation mirrors this exactly.
- `idb` transaction idiom (queue all writes synchronously, one `tx.done`) is in
  `useListItems.addListItem` and `idbClient.resetUserData`. Reused for the batch
  `sort_order` rewrite.
- No drag-and-drop library is currently installed; none of the existing code
  uses HTML5 DnD or pointer-drag. @dnd-kit is a net-new dependency.

## Relevant ADRs

- **ADR-0004** (Zustand + TanStack Query): persistent aisle order is server/DB
  state, so it lives in a TanStack Query mutation backed by IndexedDB, **not** in
  Zustand. The transient "which row is being dragged" state stays inside the
  dnd-kit context / component-local state, never persisted. No deviation.
- **ADR-0005** (Atomic Design): the data-fetching + mutation wiring stays in the
  **route** (organism-level responsibility); `AisleCard` stays presentational and
  gains a `dragHandleProps`-style passthrough + handle, with no store/hook access;
  a thin `SortableAisleCard` molecule adapts `useSortable` to `AisleCard`. The DB
  logic stays in `hooks/` per separation-of-concerns. No deviation.
- **ADR-0002** (IndexedDB for core storage): reorder persists by rewriting
  `sort_order` on the seeded `aisles` rows in a single readwrite transaction —
  consistent with how aisle overrides are already written in place. No deviation.
- **ADR-0008** (design tokens): drag handle + dragging state use existing tokens
  (`text-text-muted`, `shadow-sm` → `shadow-lg` while lifted, `opacity`); no new
  tokens. No deviation.

No ADR is contradicted. **No new ADR required** — this introduces no new data
model, persistence pattern, or service boundary; it reuses the existing
`sort_order` field, the established optimistic-mutation pattern, and the existing
route. The only architectural note worth recording is the new dependency, which
is captured here and was explicitly approved.

## Approach

A drag-and-drop reorder over the existing aisle list on `/stores/:id`, persisting
the result by rewriting `sort_order`. dnd-kit provides touch + mouse + keyboard
sensors; the route owns data + persistence; the cards stay presentational.

### 1. Dependencies (approved package.json change)

Add (latest stable, `npm install`, do not hand-edit `package-lock.json`):

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

These are the standard trio for a vertical sortable list. No other deps.

### 2. Reorder mutation — `src/hooks/useAisles.ts` (extend, same file)

Add `useReorderAisles()` alongside `useAisles`, mirroring the
`useToggleListItem` optimistic pattern.

- Input: `{ storeId: string; orderedIds: string[] }` — the full list of this
  store's aisle ids in their new visual order.
- `mutationFn`:
  - `const db = await dbPromise;`
  - Read phase (outside tx): `getAllFromIndex('aisles', 'store_id', storeId)`.
  - Compute new `sort_order` for each aisle from its index in `orderedIds`
    (0-based, or `idx * 10` to leave gaps — pick 0-based contiguous for
    simplicity; the field is purely an ordinal).
  - Write phase: one `db.transaction(['aisles'], 'readwrite')`, queue a
    `put` per changed aisle synchronously, single `await tx.done`. Skip rows
    whose `sort_order` is unchanged to minimise writes.
- `onMutate`: `cancelQueries({ queryKey: ['aisles', storeId] })`, snapshot the
  current `['aisles', storeId]` data, optimistically `setQueryData` to the
  reordered array (map `orderedIds` → aisle objects with patched `sort_order`,
  already in order). Return `{ snapshot }`.
- `onError`: restore `snapshot` to `['aisles', storeId]`.
- `onSettled`: `invalidateQueries({ queryKey: ['aisles', storeId] })` **and**
  `invalidateQueries({ queryKey: ['aisles', 'all'] })` (the Shop view may read
  the all-aisles query), so every consumer re-sorts.

  Note: `useAisles(undefined)` keys on `['aisles', 'all']`; `useAisles(id)` keys
  on `['aisles', id]`. Invalidate both so no consumer shows stale order.

### 3. `src/components/molecules/AisleCard.tsx` — add an optional drag handle

Keep it presentational and backward-compatible (the all-stores read-only callers,
if any, must be unaffected).

- Add optional props: `dragHandleListeners?`, `dragHandleAttributes?` (typed from
  dnd-kit's `SyntheticListenerMap` / attribute bag — or a minimal local type to
  avoid leaking dnd-kit types into a molecule; prefer a small explicit prop:
  `handle?: React.ReactNode` rendered on the left). Cleanest: accept an optional
  `handle?: ReactNode` slot; the sortable wrapper supplies the grip button.
- When `handle` is provided, render it before the label
  (`faGripVertical` icon, `text-text-muted`, `touch-none cursor-grab`,
  `aria-label="Reorder {label}"`). When absent, markup is unchanged.
- No hook/store access (molecule rule preserved).

### 4. New molecule — `src/components/molecules/SortableAisleCard.tsx`

Thin adapter that connects `useSortable` to `AisleCard`.

- Props: `{ aisle: Aisle }`.
- `const { attributes, listeners, setNodeRef, transform, transition, isDragging }
  = useSortable({ id: aisle.id });`
- Apply `CSS.Transform.toString(transform)` + `transition` to the node `style`;
  raise elevation while `isDragging` (`shadow-lg`, `opacity-90`, `z-10`).
- Render `<AisleCard aisle={aisle} handle={<grip button {...listeners}
  {...attributes} />} />` with `ref={setNodeRef}`.
- This molecule may import dnd-kit (it is an adapter); `AisleCard` stays pure.

### 5. `src/routes/StoreDetailRoute.tsx` — make the list sortable

- Local state mirrors the fetched order so dragging feels instant and survives
  the in-flight mutation: `const [order, setOrder] = useState<Aisle[]>([])` kept
  in sync with `aisles` via `useEffect` (only when not mid-drag).
- Wrap the list in `<DndContext sensors={sensors} collisionDetection={closestCenter}
  onDragEnd={handleDragEnd}>` + `<SortableContext items={order.map(a => a.id)}
  strategy={verticalListSortingStrategy}>`, mapping `order` → `SortableAisleCard`.
- Sensors: `PointerSensor` with an activation constraint (e.g.
  `{ distance: 8 }`) so a tap/scroll isn't misread as a drag on touch, plus
  `KeyboardSensor` (with `sortableKeyboardCoordinates`) for accessibility.
- `handleDragEnd(e)`: if `over` and `active.id !== over.id`, compute the new
  array with `arrayMove`, `setOrder(next)`, then
  `reorderAisles.mutate({ storeId: id, orderedIds: next.map(a => a.id) })`.
- Error affordance: on `reorderAisles.isError`, show a small inline
  `text-destructive` note ("Couldn't save order."); the optimistic rollback
  already restores the query, and the `order` effect re-syncs to the restored
  data.
- Pending/empty/not-found states unchanged.

### 6. Drag affordance / UX details

- Whole card is draggable via the grip handle (handle-based drag avoids
  fighting page scroll on touch). `touch-action: none` on the handle only.
- Reduced-motion: dnd-kit honours transitions; keep them short.
- No reordering UI when there are 0–1 aisles (nothing to sort) — still render the
  list, dnd-kit is a no-op with one item.

## Files to change

| File | Change |
| --- | --- |
| `package.json` / `package-lock.json` | **Add** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` via `npm install` (approved). |
| `src/hooks/useAisles.ts` | **Add** `useReorderAisles()` optimistic mutation (batch `sort_order` rewrite + invalidate both aisle query keys). |
| `src/components/molecules/AisleCard.tsx` | Add optional `handle?: ReactNode` slot (default markup unchanged). |
| `src/components/molecules/SortableAisleCard.tsx` | **New** `useSortable` adapter wrapping `AisleCard` with a grip handle. |
| `src/routes/StoreDetailRoute.tsx` | Wrap aisle list in `DndContext` + `SortableContext`; local order state; `onDragEnd` → mutation; inline save-error note. |

`src/db/schema.ts`, `src/db/idbClient.ts`, `src/hooks/useAisles.ts` read path:
no schema/version change.

## Implementation checklist

- [ ] `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`.
- [ ] Add `useReorderAisles()` to `src/hooks/useAisles.ts`.
- [ ] Add optional `handle` slot to `AisleCard.tsx`.
- [ ] Create `SortableAisleCard.tsx`.
- [ ] Wire `DndContext`/`SortableContext`/sensors/`onDragEnd` into `StoreDetailRoute.tsx`.
- [ ] Unit/integration tests (see below).
- [ ] E2E reorder + persistence test (see below).
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` green.

## Tests

### Unit / integration (Vitest + RTL)

- **`useAisles.test.ts`** (new or extend): seed fake-indexeddb with a store +
  3 aisles (sort_order 0,1,2); call `useReorderAisles` with a permuted
  `orderedIds`; assert the persisted rows have rewritten `sort_order` matching
  the new order, and that `useAisles(storeId)` returns them in that order.
  Add an error/rollback case (mutationFn throws → query data restored).
- **`AisleCard.test.tsx`** (extend): with no `handle`, markup/label/Badge
  unchanged (existing assertions still pass); with a `handle` node, the handle
  renders before the label.
- **`SortableAisleCard.test.tsx`** (new): renders an `AisleCard` for the given
  aisle with a reorder handle exposing an accessible name
  (`Reorder {label}`). (Full pointer-drag simulation is covered by E2E; unit
  level asserts structure + handle wiring, wrapping in a `DndContext`/
  `SortableContext` test harness.)
- **`StoreDetailRoute.test.tsx`** (extend): renders aisles in `sort_order`;
  asserts each row exposes a reorder handle. (Programmatic drag via dnd-kit is
  brittle in jsdom/happy-dom; rely on E2E for the actual drag, and optionally
  unit-test `handleDragEnd`'s array math if extracted to a pure helper.)

### E2E (Playwright) — new `e2e/aisle-sorting.spec.ts`

Mirror `e2e/your-stores.spec.ts` setup (navigate Settings → Your Stores →
store detail).

- Drag the first aisle handle below the second (Playwright
  `dragTo` / manual `mouse.move` steps, or `locator.dragTo`); assert the visual
  order changed.
- Reload the page (or navigate away and back) and assert the new order persists
  (proves `sort_order` was written to IndexedDB).
- Optionally assert the Shop view reflects the same new aisle order (proves the
  single-source-of-truth claim) — keep light if it adds flakiness.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — aisle-sorting flow green (this feature is gesture-based,
   so E2E is required, not optional).

## Out of scope

- Creating, deleting, renaming aisles, or editing aisle number/label.
- Reordering items within an aisle (separate backlog concern).
- Any change to the data model / `DB_VERSION` (reorder reuses `sort_order`).
- Reorder UI anywhere other than the store detail settings view.
- Multi-store behaviour beyond the single seeded store (each store's aisles sort
  independently via the `store_id` index, which already works).
