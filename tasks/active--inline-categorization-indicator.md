# Task: Inline "actively categorizing" indicator

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
This task adds that distinction.

### Root cause (two parts)

**(1) Grouping.** `src/components/organisms/ShoppingListBuilder.tsx` buckets items
by their persisted location. An item with no location lands in the
**Uncategorized** bucket (lines ~55–67) regardless of whether the matcher is
mid-flight — so the user sees it *under the "Uncategorized" header* while it is
still being classified. The pulsing `…` badge (`isAnalyzing`, line ~78) has the
same flaw: every unchecked item without a valid aisle gets it.

**(2) No failure signal.** The information needed to tell "in progress" from
"settled" — *is a classification queued/in flight, and did the matcher even load
successfully?* — is **ephemeral runtime state owned by `AddItemForm`** (the sole
consumer of `useAisleMatcher`, per ADR-0013). It is not derivable from persisted
IndexedDB data (which only records "has a location or not"). Worse, the worker
(`src/workers/aisleMatcher.worker.ts`) only ever posts `ready`/`result` — there
is **no error path**, and `useAisleMatcher` has no `onerror` handler or readiness
timeout. So "the worker tried to ready and failed" is currently **undetectable**,
which is exactly the case the requirement says must resolve to "Uncategorized."
`ShoppingListBuilder` (a sibling organism under `ShoppingListDetailRoute`) has no
access to any of this today.

## Relevant ADRs

- **ADR-0004** (Zustand for ephemeral UI state / TanStack Query for persistent
  data): the "actively categorizing" set is session-only ephemeral UI state, so
  it belongs in a Zustand slice in `src/stores/`. This is the **first** Zustand
  slice in the project (the dir is specced in CLAUDE.md but empty), so it
  establishes the pattern; it must not write to IndexedDB and must not import
  from `hooks/`.
- **ADR-0013** (web-worker aisle inference): `useAisleMatcher` stays the sole
  matcher consumer (via `AddItemForm`), and the lexical/worker split is untouched.
  We **additively** extend it: a new `{ type: 'error' }` worker response and a new
  `status` field on the hook result. `prime`/`classify`/`isReady` keep their
  signatures (`isReady` is derived from `status`), so the public contract holds.
  Adding a failure path is consistent with the ADR's note that the worker is an
  implementation detail behind the hook.
- **ADR-0009 / ADR-0011** (on-demand model, layered matching): low-confidence
  items still land in Uncategorized — unchanged. We only add the "in progress vs
  settled" distinction and keep in-progress items out of the Uncategorized group.

No ADR is contradicted. **No new ADR required** — ADR-0004 already mandates
Zustand for this kind of state, and the matcher changes are additive within
ADR-0013's existing boundary. (If implemented via the React Context fallback
instead of Zustand, add a short note to ADR-0004's record.)

## Dependency note (requires approval)

`zustand` is **not yet installed** (`package.json` has no zustand entry). Per
CLAUDE.md, changes to `package.json`/`package-lock.json` require explicit
approval. **Before implementation, confirm adding `zustand`** (`npm install
zustand`). If declined, the fallback is a React Context provider wrapping
`ShoppingListDetailRoute` (see "Alternative considered"); the rest of the plan is
unchanged in shape.

## Approach

Four pieces. The first two close the failure gap that makes the worried edge
(stuck spinner on a worker that never loads) impossible:

- **A.** Give `useAisleMatcher` a real **`status`** (`idle`/`loading`/`ready`/
  `failed`) with worker error + readiness-timeout detection.
- **B.** A Zustand slice holding the matcher `status` plus the set of item ids
  currently being categorized, so both sibling organisms can read it.
- **C.** `AddItemForm` records begin/end around its classification lifecycle and
  publishes the matcher status to the store.
- **D.** `ShoppingListBuilder` resolves each item into one of three states —
  *categorizing* (spinner, its **own group**, never under "Uncategorized"),
  *uncategorized* (tappable Categorize badge — only when terminally settled), or
  *has aisle* (tappable aisle badge — unchanged).

### A. Matcher failure detection + `status`

`src/workers/aisleMatcher.worker.ts`

- Extend the `WorkerResponse` union with `{ type: 'error' }`.
- Wrap the body of `load()` in try/catch (the `pipeline()` init or an `embed()`
  can throw — e.g. WASM init failure, or a first-ever load with no cached model
  and no network). On catch, `ctx.postMessage({ type: 'error' })`. Guard with the
  `loadToken` check so a superseded load doesn't post a spurious error.

`src/hooks/useAisleMatcher.ts`

- Add a module-level `matcherStatus: 'idle' | 'loading' | 'ready' | 'failed'`
  alongside the existing worker singleton, plus a `statusListeners` set (mirror
  the existing `readyListeners` pattern; `isReady` becomes `status === 'ready'`).
- `ensureLoaded` (a real load is starting): set status `'loading'`, start a
  **readiness timeout** (≈20 s). On the worker's `ready` message: clear the
  timeout, set `'ready'`. On `{ type: 'error' }`, `worker.onerror`, or timeout
  expiry: set `'failed'` and clear pending classifications (resolve them `''`).
- A later `prime()` after `'failed'` (or a store switch) resets `loadedStoreKey`
  so the matcher **retries** from `'loading'` — failure is per-attempt, not a
  permanent dead-end.
- Expose `status` on the hook result (additive; `prime`/`classify`/`isReady`
  unchanged, so ADR-0013's public-API contract holds — `isReady` is now derived
  from `status`).

### B. Categorization status store

`src/stores/useCategorizationStore.ts` (new)

```ts
import { create } from 'zustand';

export type MatcherStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface CategorizationState {
  /** Mirror of the active store's matcher lifecycle, published by AddItemForm. */
  status: MatcherStatus;
  /** Item ids with a classification queued or in flight for the active store. */
  categorizingIds: Set<string>;
  setStatus: (status: MatcherStatus) => void;
  begin: (itemId: string) => void;
  end: (itemId: string) => void;
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
}));
```

- New `Set` identity on every real change so selector subscribers re-render;
  `begin`/`end`/`setStatus` are idempotent (same-reference return on no-ops).
- Ephemeral by design: a reload starts `idle`/empty — correct, nothing is in
  flight after a reload.

### C. Instrument the lifecycle in `AddItemForm`

`src/components/organisms/AddItemForm.tsx`

Read the actions once: `const { begin, end, setStatus } = useCategorizationStore();`
(select actions, not the set, so the form doesn't re-render on set changes).

- **Publish status.** `const { prime, classify, isReady, status } =
  useAisleMatcher(...)`. In an effect, `setStatus(status)` whenever it changes so
  `ShoppingListBuilder` can read it.

An item id enters the set when a classification is queued/started and leaves when
that classification **settles** (resolves, with or without an aisle). Use
`.finally()` so the id is always released.

1. **On-add path** (`handleSubmit` → `mutate` `onSuccess`): mark the item
   categorizing as soon as it is added needing a location — this covers the
   model-load window so it shows the spinner immediately instead of flashing
   "Uncategorized". (`addListItem` is not optimistic — it awaits the refetch — and
   `begin()` runs synchronously here *before* the item re-renders, so there is no
   flash.)

   ```ts
   if (result.newItemId && activeStore && !locatedItemIds.has(result.newItemId)) {
     const newItemId = result.newItemId;
     // Only claim "categorizing" if the matcher can actually run; with no
     // candidates prime() is a no-op and the item is genuinely uncategorized.
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
       // else: leave it in the set; the deferred reclassify loop claims and
       // releases it once the worker is ready.
     }
   }
   ```

2. **Deferred reclassify loop** (the `isReady` effect): wrap each item's classify
   in begin/finally-end. This classifies items queued during the load window and
   **settles** items the matcher can't place (they leave the set → uncategorized):

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

3. **Release on failure.** In an effect keyed on `status`, when `status ===
   'failed'`, `end()` every id this form began. Combined with the store rule in
   §D, those items drop to **Uncategorized** (the requirement's worker-failed
   case) — no stuck spinner.

4. **Remove the aggregate banner.** The existing `showClassifying` "Classifying…"
   `<p>` is superseded by per-item spinners; remove it and its derived state.

5. **Cleanup on unmount.** Track the form's begun-ids in a `useRef<Set<string>>`
   and `end()` each on unmount, so navigating away never leaves orphaned spinners.

> The worried edge is now closed by §A: a worker that never readies trips either
> `worker.onerror` or the readiness timeout → `status: 'failed'` → step 3
> releases the items → they render as **Uncategorized**, exactly as required.
> There is no indefinite spinner.

### D. Render three states

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

`src/components/organisms/ShoppingListBuilder.tsx` — **the key change: a separate
Categorizing bucket so in-progress items never render under "Uncategorized".**

- Subscribe: `const categorizingIds = useCategorizationStore((s) =>
  s.categorizingIds);` and `const status = useCategorizationStore((s) =>
  s.status);`
- The state rule (makes "Uncategorized" terminal-only). For an **unchecked** item:

  ```ts
  const hasAisle = !!aisleId && aisleById.has(aisleId);
  // In progress while the matcher is loading, or this item is queued/in flight.
  const isCategorizing = !hasAisle && (status === 'loading' || categorizingIds.has(li.item_id));
  // Uncategorized ONLY when terminally settled: no aisle, not in progress
  // (status ready with no match / failed / idle).
  ```

- **Bucketing** (replaces the current two-way unchecked/uncategorized split):
  walk `unchecked` into three groups — aisle buckets (has aisle), a
  `categorizing[]` list (`isCategorizing`), and an `uncategorized[]` list (the
  rest). Render order: sorted aisle groups, then a **"Categorizing…"**
  `AisleGroup` (`isSpecial`) if `categorizing.length`, then the existing
  **"Uncategorized"** `AisleGroup` if `uncategorized.length`, then **"Done"**.
  → An item being classified now sits under "Categorizing…", and only drops into
  "Uncategorized" once the matcher has definitively given up on it.
- Pass `isCategorizing` to each `GroceryListItem`. Items in `uncategorized[]`
  still receive `aisles`/`currentAisleId`/`onAisleChange`, so the tappable
  "Categorize" affordance works.
- The `onAisleChange` → `upsertLocation.mutate({ itemId, storeId, aisleId })`
  manual write is unchanged (no `auto` flag → unconditional, manual pick wins).

> Why `status === 'loading'` in the rule: the moment the worker starts loading,
> every not-yet-placed item is about to be (re)classified by the deferred loop, so
> they all belong under "Categorizing…", not "Uncategorized". Newly-added items
> are additionally covered by their `begin()` on add, so they never flash.

## Files to change

| File | Change |
| --- | --- |
| `package.json` | **(gated on approval)** add `zustand` dependency. |
| `src/workers/aisleMatcher.worker.ts` | add `{ type: 'error' }` response; try/catch around `load()`. |
| `src/hooks/useAisleMatcher.ts` | add `status` (idle/loading/ready/failed) with worker-error + readiness-timeout detection; expose it; `isReady` derived from it. |
| `src/stores/useCategorizationStore.ts` | **new** — ephemeral `status` mirror + set of categorizing item ids (`setStatus`/`begin`/`end`). |
| `src/components/atoms/Spinner.tsx` | **new** atom — inline spinner for the badge slot. |
| `src/components/molecules/GroceryListItem.tsx` | three-state badge: spinner (categorizing) / aisle / Categorize (settled). |
| `src/components/organisms/ShoppingListBuilder.tsx` | separate "Categorizing…" bucket; derive `isCategorizing` from store `status` + set; pass it down. |
| `src/components/organisms/AddItemForm.tsx` | publish `status` to store; `begin`/`end` around the two classify sites; release on `failed`; unmount cleanup; remove aggregate banner. |

`ShoppingListDetailRoute.tsx` needs no change (no provider with the Zustand
approach).

## Tests

- `src/hooks/__tests__/useAisleMatcher.test.ts` (extend)
  - worker posts `ready` → `status` is `'ready'`; `isReady` true.
  - worker posts `{ type: 'error' }` (or `worker.onerror` fires) → `status` is
    `'failed'`; in-flight `classify` promises resolve `''`.
  - readiness timeout elapses with no `ready` → `status` is `'failed'` (use fake
    timers).
  - a `prime()` after `'failed'` re-enters `'loading'` (retry).
- `src/stores/__tests__/useCategorizationStore.test.ts` (new)
  - `begin` adds an id; `end` removes it; `setStatus` updates status; all
    idempotent (same reference on no-ops).
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
  - store `status: 'loading'`: an unchecked, unlocated item renders under
    **"Categorizing…"** (spinner), **not** under "Uncategorized".
  - item id in `categorizingIds` (status `'ready'`) → spinner under "Categorizing…".
  - status `'ready'`/`'failed'`, item unlocated and **not** in the set →
    **"Uncategorized"** group with the tappable "Categorize" affordance, no spinner.
  - located item → aisle badge in its aisle group. (Mock/seed `useCategorizationStore`.)
- `src/components/organisms/__tests__/AddItemForm.test.tsx` (extend)
  - on add of an item needing a location with matcher ready: `begin(itemId)` then
    `end(itemId)` after classify resolves (spy the store actions).
  - deferred reclassify loop: `begin`/`end` called per unlocated item; an item
    that classifies to no aisle still gets `end` (→ becomes settled).
  - `status` is published to the store via `setStatus` as the matcher changes.
  - on `status: 'failed'`, every begun id is `end`-ed (released to Uncategorized).
  - the aggregate "Classifying…" banner no longer renders.

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
holding a `useState<Set<string>>` + `begin`/`end`). `AddItemForm` and
`ShoppingListBuilder` consume it. No new dependency, but it deviates from
ADR-0004's explicit choice of Zustand over context for ephemeral state, so it
would warrant a short note in the ADR record. Component/lifecycle logic is
otherwise identical.

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
