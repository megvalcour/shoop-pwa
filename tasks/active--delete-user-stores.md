---
status: active
class: standard
e2e_required: true
clarifications: |
  Scope = let the user delete a store they added themselves (ADR-0024 custom
  store), removing the store record plus everything that store owns (its aisles
  and its per-store item_locations). Bundled stores (Oxford, Big Y, General)
  are NOT deletable — they have no delete affordance.
  UI: the delete action lives on the store detail page (/stores/:id), in the
  same column as the existing "Set as current store" / "Current store" control,
  guarded behind the existing ConfirmDialog. On success, navigate back to
  Settings.
  Open decisions (recommendations made below, flag if wrong):
   1. Shared catalog `items` introduced by a deleted store are LEFT IN PLACE
      (items are store-agnostic and may be referenced by lists/default list).
   2. If the deleted store is the active store, the active-store preference is
      reset to the default (Oxford) store id.
---

# Task: Delete user-added stores

## Problem

ADR-0024 lets the user add a custom store from an AI-generated JSON import, but
explicitly left "editing/deleting a custom store after import" out of scope.
There is now no way to remove a store once added — a typo'd import, a store the
user no longer shops at, or a bad AI generation is permanent short of the
nuclear "Reset all data" in the Danger Zone (which also wipes lists and the
default list). We need a per-store delete for user-authored stores only.

## Current state (already implemented)

- **Store creation** — `src/hooks/useImportStore.ts` mints a store id/slug and
  writes one atomic transaction across `stores` + `aisles` + `items` +
  `item_locations`. This is the exact shape a delete must unwind (minus the
  shared `items` — see Decision 1). It invalidates `['stores']`, `['aisles']`,
  `['items']`, `['item_locations']` on success — the same keys a delete touches.
- **Store detail page** — `src/routes/StoreDetailRoute.tsx` already fetches the
  store (`useStores().data.find`), shows a header (logo/name/address), and a
  "Set as current store" button / "Current store" badge (`useActiveStore` +
  `useSetActiveStoreId`). This is where the delete control belongs.
- **Confirm pattern** — `src/components/molecules/ConfirmDialog.tsx`
  (`role="alertdialog"`, danger button, `isPending`/`errorMessage` props) is the
  established destructive-confirm idiom (delete-list flow, Danger Zone reset).
- **Reset reference** — `resetUserData()` in `src/db/idbClient.ts` is the model
  for a synchronous multi-store transaction (queue every op before the first
  `await`, one atomic commit).
- **Aisles / locations are indexed by `store_id`** (`schema.ts`), so a store's
  rows are deletable via `getAllKeysFromIndex('aisles','store_id',id)` /
  `index('store_id')` without a full scan — same idiom the v5 Big Y migration
  uses.
- **Active-store resolution** — `useActiveStoreId` returns the stored pref value
  if present (even if it now points at a deleted store); `useActiveStore` then
  does `stores.find(...) ?? stores[0]`, so a dangling pref degrades gracefully.
  We still proactively reset the pref (Decision 2) to keep the persisted value
  honest and avoid a stale highlight.

## Distinguishing user stores from bundled stores

Bundled stores have stable seed UUIDs; user stores get a fresh
`crypto.randomUUID()`. There is no `isBuiltIn` flag today. The cleanest,
single-source way to gate delete:

- In `src/db/idbClient.ts`, export a frozen set of the three bundled ids,
  derived from the seed assets already imported there:

  ```ts
  export const BUILTIN_STORE_IDS: ReadonlySet<string> = new Set([
    oxfordSeed.store.id, // 176870f4-…
    bigYSeed.store.id,   // c322a337-…
    generalSeed.store.id, // 2927f300-… (=== GENERAL_STORE_ID)
  ]);

  export function isBuiltInStore(id: string): boolean {
    return BUILTIN_STORE_IDS.has(id);
  }
  ```

- A store is deletable iff `!isBuiltInStore(store.id)`. The detail page renders
  the delete control only for deletable stores; the hook also guards (throws on
  a built-in id) so the rule is enforced at the data layer, not just hidden in
  the UI.

This rides the existing seed imports — no new asset, no flag column, no
`DB_VERSION` bump.

## Relevant ADRs

- **ADR-0024 (user-authored stores):** this feature is the deliberate follow-on
  to that ADR's "deleting a custom store … is out of scope." It does not
  contradict it — it completes it. The additive shape (catalog items shared,
  store owns aisles + item_locations) is exactly what we unwind. **No new ADR
  required:** no new object store, index, persistence pattern, or service
  boundary — delete is the mirror of the accepted `useImportStore` write and
  follows the `resetUserData` transaction idiom. (If the reviewer feels a "user
  store lifecycle" decision is worth recording, a short ADR could capture
  Decisions 1 & 2; not blocking.)
- **ADR-0015 (per-store item_locations):** delete removes only this store's
  `item_locations` rows; the shared catalog and other stores' locations are
  untouched, so the matcher's candidate set for every other store is unchanged.
- **ADR-0002 (IndexedDB) / ADR-0004 (TanStack Query + Zustand):** all IDB logic
  stays in `db/`/`hooks/`; delete is one mutation hook that invalidates caches.
- **ADR-0005 (atomic design):** the delete button + confirm wiring live in the
  existing `StoreDetailRoute` (a route/organism-level surface that may touch
  hooks); no new molecule needs store access.
- **No `DB_VERSION` bump** → ADR-0017 migration gate not engaged; this is a
  `feat:` commit regardless (new user-facing capability), not a migration.

## Decisions (recommendations — flag if wrong)

### Decision 1 — Leave shared `items` in place

When a custom store is imported, brand-new item names are added to the shared,
store-agnostic `items` catalog (`useImportStore` via `resolveItem`). Those rows
are **not** owned by the store — they may now be referenced by the default list,
shopping lists, or other stores' `item_locations`. Deleting them risks dangling
references and re-running orphan analysis across every store on every delete.

**Recommendation:** delete only `stores` + `aisles` + `item_locations` for the
store. Leave `items` untouched. Orphaned catalog rows are harmless (an item with
no location simply classifies via the matcher when next used) and a full
"Reset all data" still reclaims them. This matches the additive philosophy of
ADR-0024 and keeps the delete a bounded, index-scoped operation.

### Decision 2 — Reset active-store pref if deleting the active store

If the store being deleted is the current active store, write the
`active_store_id` preference back to the default (Oxford) id inside the same
transaction. This keeps the persisted pref pointing at a real store and avoids a
moment where the header resolves via the `?? stores[0]` fallback with a stale
stored value. If the deleted store is not active, the pref is left alone.

## Approach

### 1. `src/db/idbClient.ts` — built-in guard + `deleteStore`

- Export `BUILTIN_STORE_IDS` / `isBuiltInStore` (above).
- Add and export `deleteStore(storeId: string): Promise<void>`:
  - Throw if `isBuiltInStore(storeId)` (defensive — UI won't offer it).
  - **Read phase** (outside the tx): gather the aisle keys and item_location
    keys for the store via the `store_id` indexes; read the active-store pref.
  - **Write phase** (one `readwrite` tx over
    `['stores','aisles','item_locations','preferences']`, every op queued before
    the first `await`, mirroring `resetUserData`):
    - `delete` the store row,
    - `delete` each aisle key,
    - `delete` each item_location key,
    - if the deleted store was the active one, `put` the pref back to
      `DEFAULT_ACTIVE_STORE_ID` (Decision 2).
  - `await tx.done`.
  - Note: do **not** include `items` (Decision 1).

### 2. `src/hooks/useDeleteStore.ts` — mutation hook (new)

Mirror `useImportStore`'s success-invalidation set so every store-keyed cache
refetches:

```ts
export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => deleteStore(storeId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['aisles'] }),
        queryClient.invalidateQueries({ queryKey: ['item_locations'] }),
        queryClient.invalidateQueries({ queryKey: ACTIVE_STORE_QUERY_KEY }),
      ]),
  });
}
```

(`['items']` need not be invalidated since the catalog is unchanged.)

### 3. `src/routes/StoreDetailRoute.tsx` — delete affordance

- Import `useDeleteStore`, `isBuiltInStore`, `useNavigate`, `ConfirmDialog`,
  and add local `const [confirming, setConfirming] = useState(false)`.
- Compute `const deletable = !isBuiltInStore(store.id);`.
- Render a destructive **"Delete store"** `Button variant="danger"` only when
  `deletable`, placed at the bottom of the detail body (after the aisle list),
  visually separated from the aisle-reorder area. Opens the confirm dialog.
- `ConfirmDialog` when `confirming`:
  - `title="Delete this store?"`
  - `message`: e.g. "{store.name} and its aisles will be permanently deleted.
    Your shopping lists and saved items aren't affected. This can't be undone."
  - `confirmLabel="Delete"`, `destructive`,
  - `isPending={deleteStore.isPending}`,
  - `errorMessage={deleteStore.isError ? "Couldn't delete the store. Please try again." : undefined}`,
  - `onCancel`: `deleteStore.reset()` + `setConfirming(false)`,
  - `onConfirm`: `deleteStore.mutate(store.id, { onSuccess: () => navigate('/settings') })`.
- Built-in stores render no delete button (and the guard in the hook backstops
  it).

> Verify the Settings route path used by `navigate(...)` against `src/App.tsx`
> (the "Your Stores" list lives in Settings); adjust the target if it differs.

## Files to change

| File | Change |
| --- | --- |
| `src/db/idbClient.ts` | Export `BUILTIN_STORE_IDS`/`isBuiltInStore`; add `deleteStore(storeId)`. |
| `src/hooks/useDeleteStore.ts` | **New** mutation hook wrapping `deleteStore` + cache invalidation. |
| `src/routes/StoreDetailRoute.tsx` | Delete button (user stores only) + ConfirmDialog + navigate-back. |
| `src/db/__tests__/idbClient.test.ts` | Extend: `deleteStore` removes store/aisles/locations, spares items, resets active pref, rejects built-ins. |
| `src/hooks/__tests__/useDeleteStore.test.ts` | **New** hook test (calls `deleteStore`, invalidates on success). |
| `src/routes/__tests__/StoreDetailRoute.test.tsx` | Extend: delete shown only for user stores; confirm → delete → navigate. |
| `e2e/your-stores.spec.ts` | Extend: import a store, delete it, assert it's gone from Settings. |

## Implementation checklist

- [ ] `BUILTIN_STORE_IDS` / `isBuiltInStore` exported from `idbClient.ts`.
- [ ] `deleteStore(storeId)` added (index-scoped deletes, active-pref reset, built-in guard, single atomic tx).
- [ ] `useDeleteStore` hook created with matching invalidations.
- [ ] `StoreDetailRoute` delete button (user stores only) + ConfirmDialog + back-nav.
- [ ] Unit/integration tests (db + hook + route).
- [ ] E2E delete flow.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` green.
- [ ] `PLAN.md` updated; rename this file to `tasks/complete--delete-user-stores.md`.

## Tests

### Unit / integration (Vitest + RTL, fake-indexeddb)

- **`idbClient.test.ts` (extend):**
  - After seeding + importing a user store (or directly adding store/aisles/
    locations with a non-built-in id), `deleteStore(id)` removes the store row,
    all its aisles (by `store_id` index), and all its item_locations.
  - **Spares the shared catalog:** `items` count is unchanged after delete
    (Decision 1).
  - **Other stores untouched:** Big Y / General aisles + locations remain.
  - **Active-pref reset:** set the user store active, delete it, assert
    `preferences[active_store_id] === DEFAULT_ACTIVE_STORE_ID`; deleting a
    non-active store leaves the pref unchanged.
  - **Built-in guard:** `deleteStore(oxfordId)` rejects and mutates nothing.
- **`useDeleteStore.test.ts` (new):** mutation calls `deleteStore` and
  invalidates the four query keys on success (spy on `invalidateQueries`).
- **`StoreDetailRoute.test.tsx` (extend):**
  - No "Delete store" button for a built-in store.
  - Button present for a user store; clicking opens the dialog **without**
    deleting; cancel closes and leaves the store; confirm deletes and navigates
    to Settings (assert via stub route element, matching existing test idiom).

### E2E (Playwright) — extend `e2e/your-stores.spec.ts`

- Import a custom store (reuse the existing add-store flow / fixture), open it
  from "Your Stores", delete via the confirm dialog, and assert it no longer
  appears in the Settings "Your Stores" list and the bundled stores remain.
  (Per AGENTS.md, `validate` does not cover E2E — run `test:e2e` before done.)

## Out of scope

- Editing/renaming a store or its address (separate task).
- Deleting bundled stores (Oxford/Big Y/General) — intentionally protected.
- Orphaned-catalog-item cleanup on delete (Decision 1: left to "Reset all data").
- Any change to the data model, schema, indexes, or `DB_VERSION`.

## Definition of done

- `npm run validate` green (typecheck + lint + unit).
- `npm run test:e2e` green.
- `PLAN.md` updated and this file renamed to `tasks/complete--delete-user-stores.md`.
