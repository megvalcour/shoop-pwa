# Task: Inline "actively categorizing" indicator

> **Plan refreshed 2026-06-23** against the current codebase. Since the original
> draft, three refactors landed that move where this work has to happen:
> the matcher lifecycle was extracted out of `AddItemForm` into
> `hooks/useItemClassification.ts` (`complete--extract-useitemclassification`);
> the three-way bucketing now lives in the pure `lib/groupListItemsByAisle.ts`
> (`complete--extract-pure-grouping-and-aisle-format`); and `GroceryListItem`
> delegates its row to `ListItemRow` while the matcher itself went
> store-parametrized under **ADR-0015**. The problem is unchanged; the touch
> points are different. Affected sections are flagged **[updated]**.

## Problem

When a user adds an item, it first appears under the **"Uncategorized" group
header**, then a moment later jumps to its correct aisle. That transient
"Uncategorized" flash is the bug. The user requirement:

> Never show an item as Uncategorized unless it genuinely **cannot** be
> categorized — i.e. the matcher ran and found no confident match, **or** the
> matcher attempted to become ready and failed.

In other words, **"Uncategorized" must be a positively-confirmed terminal state,
never a transient one.** While the matcher is loading or a classification is in
flight, the item must read as *categorizing*, not uncategorized.

Today an unchecked item with no aisle is in two distinct situations that the UI
cannot tell apart:

1. **Actively categorizing** — the matcher is still working (the worker model is
   loading, or a `classify()` call is in flight). An aisle may land any moment.
2. **Settled-uncategorized** — the matcher finished and produced no confident
   aisle, *or the matcher failed to load*. The item needs a manual pick.

This conflation was called out as out of scope in
`tasks/complete--manual-categorize-uncategorized.md` ("Distinguishing 'actively
analyzing' from 'settled-but-uncategorized' would need an inference-state flag").
That task shipped the manual-pick affordance but folded it onto the same pulsing
"…" badge every unlocated item shows — so the two states above are still
visually identical. This task adds the missing distinction.

### Root cause (two parts) **[updated]**

**(1) Grouping is location-only.** `src/lib/groupListItemsByAisle.ts` is now the
pure function that buckets a list into `{ buckets, uncategorized, checked }`. An
unchecked item whose resolved `aisle_id` is empty or unknown is pushed to
`uncategorized` (lines ~38–50) **regardless of whether the matcher is
mid-flight**. `ShoppingListBuilder.tsx` renders that `uncategorized` array under
the "Uncategorized" header and, per item, computes
`isAnalyzing = !li.checked && (!aisleId || !aisleById.has(aisleId))`
(`ShoppingListBuilder.tsx:52`) — i.e. *every* unlocated unchecked item gets the
pulsing badge, whether or not classification is actually running. So the user
sees an in-flight item **under the "Uncategorized" header with a "…" badge**.

**(2) No in-progress / failure signal reaches the list.** Whether a
classification is queued or in flight — and whether the matcher even loaded — is
**ephemeral runtime state owned by `hooks/useItemClassification.ts`** (the new
sole consumer of `useAisleMatcher`). It is not derivable from persisted
IndexedDB data (which only records "has a location or not"), and it does not
reach `ShoppingListBuilder`, a sibling organism under `ShoppingListDetailRoute`.
The hook exposes only an aggregate `isClassifying` boolean, consumed by
`AddItemForm` to show a single "Classifying…" banner — there is no per-item
signal.

Worse, the worker (`src/workers/aisleMatcher.worker.ts`) only ever posts
`ready`/`result` — there is **no error path** — and `useAisleMatcher` has no
`onerror` handler or readiness timeout. So "the worker tried to ready and failed"
is currently **undetectable**, which is exactly the case the requirement says
must resolve to "Uncategorized" rather than a stuck spinner.

## Relevant ADRs **[updated]**

- **ADR-0004** (Zustand for ephemeral UI state / TanStack Query for persistent
  data): the "actively categorizing" set is session-only ephemeral UI state, so
  it belongs in a Zustand slice in `src/stores/`. This is still the **first**
  Zustand slice in the project (`src/stores/` remains empty), so it establishes
  the pattern; it must not write to IndexedDB and must not import from `hooks/`.
- **ADR-0013** (web-worker aisle inference): the matcher's public API
  (`prime`/`classify`/`isReady`) and the lexical/worker split are untouched. We
  **additively** extend it: a new `{ type: 'error' }` worker response and a new
  `status` field on the hook result. `isReady` becomes derived from `status`, so
  the public contract holds. Note: ADR-0013's text says `AddItemForm` is the sole
  matcher consumer; that indirection now runs through
  `useItemClassification` — same boundary, one layer deeper. No ADR edit needed
  (ADR-0013 names the hook API as the contract, not the calling component).
- **ADR-0015** (store-agnostic items / active store): the matcher is now
  **per-store** — `useAisleMatcher(storeKey, candidates)` re-embeds on a store
  switch, tracking `loadedStoreKey` vs `readyStoreKey`. Consequences for this
  task: `status` is **per-load-attempt** (a store switch re-enters `loading`),
  and the categorization store's `status` + `categorizingIds` describe the
  **active store only** and must be reset on a store switch.
- **ADR-0009 / ADR-0011** (on-demand model, layered matching): low-confidence
  items still land in Uncategorized — unchanged. We only add the "in progress vs
  settled" distinction and keep in-progress items out of the Uncategorized group.

No ADR is contradicted. **No new ADR required.** (If implemented via the React
Context fallback instead of Zustand, add a short note to ADR-0004's record.)

## Dependency note (requires approval)

`zustand` is **still not installed** (`package.json` has no zustand entry). Per
CLAUDE.md, changes to `package.json`/`package-lock.json` require explicit
approval. **Before implementation, confirm adding `zustand`** (`npm install
zustand`). If declined, the fallback is a React Context provider wrapping
`ShoppingListDetailRoute` (see "Alternative considered"); the rest of the plan is
unchanged in shape.

## Approach **[updated]**

Four pieces. The first two close the failure gap that makes the worried edge
(stuck spinner on a worker that never loads) impossible:

- **A.** Give `useAisleMatcher` a real **`status`** (`idle`/`loading`/`ready`/
  `failed`) with worker error + readiness-timeout detection.
- **B.** A Zustand slice holding the matcher `status` plus the set of item ids
  currently being categorized at the active store, so both sibling organisms can
  read it.
- **C.** **`useItemClassification`** (not `AddItemForm`) records begin/end around
  its two classify sites and publishes the matcher status to the store.
- **D.** Grouping resolves each item into one of three states — *categorizing*
  (spinner, its **own group**, never under "Uncategorized"), *uncategorized*
  (tappable Categorize badge — only when terminally settled), or *has aisle*
  (tappable aisle badge — unchanged).

### A. Matcher failure detection + `status`

`src/workers/aisleMatcher.worker.ts`

- Extend the `WorkerResponse` union with `{ type: 'error' }`.
- Wrap the body of `load()` in try/catch (the `pipeline()` init or an `embed()`
  can throw — WASM init failure, or a first-ever load with no cached model and no
  network). On catch, `ctx.postMessage({ type: 'error' })`. Guard with the
  existing `loadToken` check so a superseded load doesn't post a spurious error.

`src/hooks/useAisleMatcher.ts`

- Add a module-level `matcherStatus: 'idle' | 'loading' | 'ready' | 'failed'`
  alongside the existing worker singleton + `readyListeners`/`readyStoreKey`
  bookkeeping, plus a `statusListeners` set (mirror the `readyListeners`
  pattern). `isReady` stays `storeKey != null && readyStoreKey === storeKey`,
  and additionally requires `status === 'ready'`.
- `ensureLoaded` (a real load is starting — `loadedStoreKey !== storeKey`): set
  status `'loading'` and start a **readiness timeout** (≈20 s). On the worker's
  `ready` message: clear the timeout, set `'ready'`. On `{ type: 'error' }`,
  `worker.onerror`, or timeout expiry: set `'failed'` and resolve every pending
  classification with `''`.
- Because the matcher is per-store (ADR-0015), a **store switch re-enters
  `'loading'`** naturally (it triggers a fresh `ensureLoaded`). A `prime()` after
  `'failed'` must reset `loadedStoreKey` so the matcher **retries** from
  `'loading'` — failure is per-attempt, not a permanent dead-end.
- Expose `status` on `AisleMatcherResult` (additive; `prime`/`classify`/`isReady`
  unchanged). Re-render subscribers on status change via the new listener set,
  the same way `readyListeners` already force-ticks mounted hooks.

### B. Categorization status store

`src/stores/useCategorizationStore.ts` (new)

```ts
import { create } from 'zustand';

export type MatcherStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface CategorizationState {
  /** Mirror of the active store's matcher lifecycle, published by
   *  useItemClassification. */
  status: MatcherStatus;
  /** Item ids with a classification queued or in flight for the active store. */
  categorizingIds: Set<string>;
  setStatus: (status: MatcherStatus) => void;
  begin: (itemId: string) => void;
  end: (itemId: string) => void;
  /** Clear all in-flight ids (used on active-store switch / unmount). */
  reset: () => void;
}

export const useCategorizationStore = create<CategorizationState>((set) => ({
  status: 'idle',
  categorizingIds: new Set(),
  setStatus: (status) => set((s) => (s.status === status ? s : { status })),
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
  reset: () =>
    set((s) => (s.categorizingIds.size === 0 ? s : { categorizingIds: new Set() })),
}));
```

- New `Set` identity on every real change so selector subscribers re-render;
  `begin`/`end`/`setStatus`/`reset` are idempotent (same-reference return on
  no-ops).
- Ephemeral by design: a reload starts `idle`/empty — correct, nothing is in
  flight after a reload.
- `reset` is new vs the original draft: the per-store matcher (ADR-0015) means a
  store switch must drop ids that belonged to the old store.

### C. Instrument the lifecycle in `useItemClassification` **[updated]**

`src/hooks/useItemClassification.ts` — this hook (not `AddItemForm`) now owns the
matcher and both classify sites, so the instrumentation lives here.

Select the store actions once (actions, not the set, so this hook doesn't
re-render on every set change):
`const { begin, end, setStatus, reset } = useCategorizationStore();`

- **Publish status.** Pull `status` from the matcher
  (`const { prime, classify, isReady, status } = useAisleMatcher(...)`) and, in
  an effect, `setStatus(status)` whenever it changes so `ShoppingListBuilder` can
  read it. Reset the id set on an active-store change
  (effect keyed on `activeStore?.id` → `reset()`).

An item id enters the set when a classification is queued/started and leaves when
that classification **settles** (resolves, with or without an aisle). Use
`.finally()` so the id is always released.

1. **`classifyAndPlace`** (called from `AddItemForm.handleSubmit`'s `onSuccess`):
   wrap the classify in begin/finally-end so a freshly-added item shows the
   spinner immediately instead of flashing "Uncategorized".

   ```ts
   function classifyAndPlace(itemId: string, name: string) {
     if (!activeStore || locatedItemIds.has(itemId)) return;
     // Only claim "categorizing" if the matcher can actually run. If it can't
     // (still loading), the deferred effect below claims+releases the item once
     // ready; if it never readies, status:'failed' releases it (step 3).
     if (!isReady) {
       if (status === 'loading') begin(itemId); // covers the load window
       return;
     }
     begin(itemId);
     classify(name, aisles ?? [])
       .then((aisleId) => {
         if (aisleId)
           upsertLocation.mutate({ itemId, storeId: activeStore.id, aisleId, auto: true });
       })
       .finally(() => end(itemId));
   }
   ```

2. **Deferred reclassify loop** (the existing `isReady` effect): wrap each item's
   classify in begin/finally-end. This classifies items queued during the load
   window and **settles** items the matcher can't place (they leave the set →
   uncategorized):

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

3. **Release on failure.** In an effect keyed on `status`, when
   `status === 'failed'`, `reset()` the set. Combined with the grouping rule in
   §D, those items drop to **Uncategorized** (the requirement's worker-failed
   case) — no stuck spinner.

4. **Remove the aggregate signal.** Drop the `isClassifying` boolean from the
   hook's return (superseded by per-item state) and remove the "Classifying…"
   `<p>` it drives in `AddItemForm`. `AddItemForm` then no longer reads anything
   from the store; it stays the thin form it is today.

5. **Cleanup on unmount.** `reset()` (or `end()` each tracked id via a
   `useRef<Set<string>>`) on the hook's unmount, so navigating away never leaves
   orphaned spinners.

> The worried edge is closed by §A: a worker that never readies trips either
> `worker.onerror` or the readiness timeout → `status: 'failed'` → step 3
> releases the items → they render as **Uncategorized**, exactly as required.
> There is no indefinite spinner.

### D. Render three states **[updated]**

`src/components/atoms/Spinner.tsx` (new atom — no business logic, per CLAUDE.md)

- Small spinner sized to sit in the badge slot. Reuse the existing **`Icon`**
  atom (`@/components/atoms/Icon`) with FontAwesome `faSpinner` + Tailwind
  `animate-spin` (FontAwesome is the icon system — ADR-0007). Props: `className?`,
  `aria-label?` (default `"Loading"`), `role="status"`.

`src/components/molecules/GroceryListItem.tsx`

- Replace the single `isAnalyzing` prop with an explicit `isCategorizing?:
  boolean`. Keep `aisleLabel`, `aisles`, `currentAisleId`, `onAisleChange`.
- Badge slot for **unchecked** items, in priority order:
  1. `isCategorizing` → render `<Badge variant="muted"><Spinner /></Badge>`,
     `aria-label="Categorizing item"`, **non-interactive** (no `onClick`, no
     picker). It's a status, not an action.
  2. `aisleLabel` → tappable aisle badge → opens picker. **Unchanged**
     (`aria-label="Change aisle: …"`).
  3. neither → **uncategorized-settled** affordance: a tappable badge that opens
     the picker, `aria-label="Categorize item"`. Use a clearly non-busy visual
     (a tag icon or the text "Categorize") so it reads as an actionable "needs
     your input" state, distinct from the spinner. This reuses the existing
     `canPickAisle` + `sheetOpen` + `AislePickerSheet` block already in this file
     (`currentAisleId=''` → nothing preselected, which is correct) — today that
     block is gated behind the pulsing "…" badge; here it becomes its own
     terminal state.
- Checked items: unchanged (non-interactive, no badge).
- The `stopPropagation` on the tappable badge stays so tapping it never toggles
  the item.

`src/lib/groupListItemsByAisle.ts` — **the key change: a separate Categorizing
bucket so in-progress items never land in `uncategorized`.** Keeping this in the
pure lib (rather than re-bucketing inside the organism) matches the recent
"extract pure grouping" direction and keeps it unit-testable.

- Extend the context arg with the ephemeral signal:
  `ctx: { aisleById; aisleByItem; categorizingIds: Set<string>; status: MatcherStatus }`.
- Add `categorizing: ListItem[]` to `GroupedListItems`.
- The state rule, applied to each unchecked, unlocated item:

  ```ts
  const hasAisle = !!aisleId && aisleById.has(aisleId);
  // In progress while the matcher is loading, or this item is queued/in flight.
  const isCategorizing = !hasAisle && (status === 'loading' || categorizingIds.has(li.item_id));
  ```

  → push to `categorizing` when `isCategorizing`, else to `uncategorized`. Items
  with an aisle bucket as before.

`src/components/organisms/ShoppingListBuilder.tsx`

- Subscribe with selectors:
  `const categorizingIds = useCategorizationStore((s) => s.categorizingIds);`
  and `const status = useCategorizationStore((s) => s.status);`, and pass both
  into `groupListItemsByAisle`.
- Render order: sorted aisle groups, then a **"Categorizing…"** `AisleGroup`
  (`isSpecial`) if `categorizing.length`, then the existing **"Uncategorized"**
  `AisleGroup` if `uncategorized.length`, then **"Done"**.
- Drop the inline `isAnalyzing` computation; pass `isCategorizing={true}` to the
  items rendered in the Categorizing group and `isCategorizing={false}` elsewhere
  (or compute per item from the same rule). Items in `uncategorized` still receive
  `aisles`/`currentAisleId`/`onAisleChange` so the tappable "Categorize"
  affordance works. The `onAisleChange` → `upsertLocation.mutate({ itemId,
  storeId, aisleId })` manual write is unchanged (no `auto` flag → manual pick
  wins).

> Why `status === 'loading'` in the rule: the moment the worker starts loading,
> every not-yet-placed item is about to be (re)classified by the deferred loop, so
> they all belong under "Categorizing…", not "Uncategorized". Newly-added items
> are additionally covered by their `begin()` on add, so they never flash.

## Files to change **[updated]**

| File | Change |
| --- | --- |
| `package.json` | **(gated on approval)** add `zustand` dependency. |
| `src/workers/aisleMatcher.worker.ts` | add `{ type: 'error' }` response; try/catch around `load()`. |
| `src/hooks/useAisleMatcher.ts` | add `status` (idle/loading/ready/failed) with worker-error + readiness-timeout detection; expose it; `isReady` requires `status === 'ready'`; `prime` after `failed` retries. |
| `src/stores/useCategorizationStore.ts` | **new** — ephemeral `status` mirror + set of categorizing ids (`setStatus`/`begin`/`end`/`reset`). |
| `src/hooks/useItemClassification.ts` | publish `status` to the store; `begin`/`end` around `classifyAndPlace` and the deferred loop; `reset` on `failed`, store-switch, and unmount; drop the aggregate `isClassifying`. |
| `src/components/organisms/AddItemForm.tsx` | remove the `isClassifying` "Classifying…" banner (and its read from the hook). |
| `src/components/atoms/Spinner.tsx` | **new** atom — inline spinner (built on `Icon` + `faSpinner`) for the badge slot. |
| `src/components/molecules/GroceryListItem.tsx` | three-state badge: spinner (categorizing) / aisle / Categorize (settled); replace `isAnalyzing` with `isCategorizing`. |
| `src/lib/groupListItemsByAisle.ts` | add a `categorizing` bucket; accept `categorizingIds` + `status`; in-progress items leave `uncategorized`. |
| `src/components/organisms/ShoppingListBuilder.tsx` | subscribe to the store; pass signal into grouping; render the "Categorizing…" group; pass `isCategorizing` down. |

`ShoppingListDetailRoute.tsx` needs no change (no provider with the Zustand
approach).

## Tests **[updated]**

- `src/hooks/__tests__/useAisleMatcher.test.ts` (extend)
  - worker posts `ready` → `status` is `'ready'`; `isReady` true.
  - worker posts `{ type: 'error' }` (or `worker.onerror` fires) → `status` is
    `'failed'`; in-flight `classify` promises resolve `''`.
  - readiness timeout elapses with no `ready` → `status` is `'failed'` (fake
    timers).
  - a `prime()` after `'failed'` re-enters `'loading'` (retry).
  - a store switch (`storeKey` change) re-enters `'loading'`.
- `src/stores/__tests__/useCategorizationStore.test.ts` (new)
  - `begin`/`end`/`setStatus`/`reset` behave and are idempotent; the `Set`
    reference changes on real mutations and is stable on no-ops.
- `src/components/atoms/__tests__/Spinner.test.tsx` (new)
  - renders with `role="status"` and an accessible label.
- `src/lib/__tests__/groupListItemsByAisle.test.ts` (extend)
  - `status: 'loading'`, unlocated unchecked item → in `categorizing`, **not**
    `uncategorized`.
  - item id in `categorizingIds` (status `'ready'`) → in `categorizing`.
  - status `'ready'`/`'failed'`, unlocated, not in the set → in `uncategorized`.
  - located item → its aisle bucket; checked item → `checked`.
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
- `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx` (extend;
  seed/mock `useCategorizationStore`)
  - store `status: 'loading'`: an unchecked, unlocated item renders under
    **"Categorizing…"** (spinner), **not** under "Uncategorized".
  - item id in `categorizingIds` (status `'ready'`) → spinner under "Categorizing…".
  - status `'ready'`/`'failed'`, item unlocated and **not** in the set →
    **"Uncategorized"** group with the tappable "Categorize" affordance, no spinner.
  - located item → aisle badge in its aisle group.
- `src/hooks/__tests__/useItemClassification.test.ts` (extend)
  - `classifyAndPlace` with matcher ready: `begin(itemId)` then `end(itemId)`
    after classify resolves (spy the store actions).
  - deferred reclassify loop: `begin`/`end` per unlocated item; an item that
    classifies to no aisle still gets `end` (→ becomes settled).
  - `status` is published via `setStatus` as the matcher changes; `reset` is
    called on store switch and on `status: 'failed'`.
  - the aggregate `isClassifying` is gone from the return shape (update existing
    assertions).
- `src/components/organisms/__tests__/AddItemForm.test.tsx` (extend)
  - the "Classifying…" banner no longer renders.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — confirm the core requirement end to end:
   - Add an item: it appears under **"Categorizing…"** (spinner), **never** under
     "Uncategorized", then moves into its aisle group once classified.
   - An item the matcher can't place settles into **"Uncategorized"** with the
     tappable **Categorize** badge (no spinner). Tapping it opens the picker; the
     chosen aisle sticks (the `auto` guard from the prior task still holds).
   - Worker-failure path (simulate the worker failing to load): items resolve to
     **"Uncategorized"** (not a permanent spinner).

## Alternative considered (if `zustand` is declined)

Wrap `ShoppingListDetailRoute` in a `CategorizationStatusProvider` (React Context
holding `useState` for `status` + a `Set<string>` + `begin`/`end`/`reset`).
`useItemClassification` (via the form subtree) and `ShoppingListBuilder` consume
it. No new dependency, but it deviates from ADR-0004's explicit choice of Zustand
over context for ephemeral state, so it would warrant a short note in the ADR
record. Lifecycle logic is otherwise identical.

## Out of scope

- Persisting categorization status (a schema field / `DB_VERSION` bump). The
  state is ephemeral; persisting it would leave stale "pending" rows after a
  mid-classify reload. Rejected.
- Surfacing a distinct *error* message/toast for matcher failure. We fold
  "failed" into "Uncategorized" (per the requirement); a visible "categorizer
  unavailable" affordance is a separate UX task.
- Changing matcher accuracy, thresholds, or the lexical/semantic layering
  (ADR-0011) — untouched.
- Any change to checked-item rendering or the Done group.
