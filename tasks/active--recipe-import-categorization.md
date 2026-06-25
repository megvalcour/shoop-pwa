---
step: 8
substep: 2
status: active
class: lightweight
e2e_required: true
---

# Recipe Import — Imported Items Don't Auto-Categorize

## Problem

After importing a recipe into a shopping list, the imported ingredients sit
under **"Uncategorized"** and never move to their aisle. They only start
categorizing the moment the user **manually adds another item** to that same
list. The categorization is correct once it happens — it's just never triggered
by the import itself.

### Reproduction

1. Use the recipe import flow (`/import`) to add ingredients to a **new** or
   **existing** shopping list.
2. Land on `/lists/:id`. The imported items render under "Uncategorized"
   indefinitely.
3. Type and add any item via the normal Add-item field → **all** the imported
   items immediately jump to their correct aisles.

## Root cause

Aisle classification is **driven entirely by a deliberate user signal inside
`AddItemForm`**, and the recipe-import flow produces no such signal.

The relevant machinery (established by previous tasks — see history below):

- `useItemClassification` (`src/hooks/useItemClassification.ts`) owns the matcher
  lifecycle. It is **only mounted by `AddItemForm`** (confirmed: the only
  non-test consumer). `ShoppingListDetailRoute` renders `<AddItemForm>` +
  `<ShoppingListBuilder>`.
- The matcher (`useAisleMatcher`) **only loads the WASM model when `prime()` is
  called**, and `prime()` is only called from a *deliberate user signal* —
  `AddItemForm`'s input **blur** or **submit** (`AddItemForm.tsx:38,41`) via
  `primeFromSignal`, which is gated on non-empty text. By design it is "never on
  mount" (`useItemClassification.ts:96-102`).
- The **deferred reclassify loop** (`useItemClassification.ts:117-134`) is what
  classifies *pre-existing* unlocated items. It fires only when its deps flip:
  `[isReady, activeStore?.id, itemsReady, locationsReady]`. It deliberately does
  **not** depend on the items/locations sets ("avoid classify → invalidate →
  re-classify loops").
- `useAddListItem` / `RecipeImporter` (`RecipeImporter.tsx:109-112`) add
  `list_items` (and catalog `items`) but write **no `item_locations`**. Locations
  are only ever written by the classifier. So every imported ingredient is
  **unlocated** at the active store.

Putting it together:

- Importing → `navigate('/lists/:id')` mounts `ShoppingListDetailRoute` →
  `AddItemForm` → `useItemClassification` with `hasPrimed = false`.
- Nothing primes the matcher (no blur/submit). `isReady` stays `false` forever.
- The deferred reclassify loop never fires (its `isReady` dep never flips true).
- → imported items stay unlocated → grouped as **Uncategorized**.

When the user later adds an item, `AddItemForm.handleSubmit` calls `prime(name)`
→ matcher loads → `isReady` flips `false→true` → the deferred reclassify loop
fires and classifies **every** unlocated item at the store, imported ones
included. That single side effect is why "adding one item categorizes them all."

The comment in `RecipeImporter` ("Adds go through existing hooks → existing
aisle-classification fires automatically", recipe-import plan Step 5) was the
incorrect assumption: adds do **not** by themselves prime the matcher or trigger
the deferred loop. Only `AddItemForm`'s user-signal path does.

> **Default-list import target is unaffected** by design. `DefaultListEditor`
> does no per-store classification (`DefaultListEditor.tsx:12-17`): default
> items are store-agnostic and only get an aisle when seeded into a real
> shopping list. So this bug is scoped to the **shopping-list** import targets
> (new / existing list).

## Feature & bug history (context — what to preserve)

This area has accreted several careful invariants. The fix must not regress any
of them.

- **`complete--recipe-import.md`** — shipped the import feature. Its Step 5
  assumed classification "fires automatically" on add; this task corrects that
  gap. No schema change then or now (`DB_VERSION` stays put).
- **`complete--smart-aisle-location.md` / ADR-0011 / ADR-0013** — layered
  lexical + semantic (web-worker) matching. The worker only loads on `prime()`;
  loading the heavy WASM model lazily is intentional. **Don't** load it for a
  fully-categorized list the user is merely viewing.
- **`complete--extract-useitemclassification.md`** — pulled the matcher
  lifecycle out of `AddItemForm` into `useItemClassification`. This is the
  correct home for the fix; keep `AddItemForm` a thin form.
- **`complete--manual-categorize-uncategorized.md`** — added the manual
  aisle-pick affordance and the **`auto` no-clobber** rule: the auto classifier
  must never overwrite a manually-set location. Preserve this — the fix reuses
  the existing `upsertLocation … auto: true` path, which already honors it.
- **`complete--inline-categorization-indicator.md`** — the most important one to
  not regress. It established the rule that **"Uncategorized" is a
  positively-confirmed terminal state, never transient**, via a `status`
  (`idle/loading/ready/failed`) + `categorizingIds` Zustand store and a
  `categorizing` bucket in `groupListItemsByAisle`. The grouping rule
  (`groupListItemsByAisle.ts:64`) puts unlocated unchecked items under
  **"Categorizing…"** while `status === 'loading'` or the id is in
  `categorizingIds`, and only under **"Uncategorized"** once settled. It also
  added the worker **failure path** (worker `error` / readiness timeout →
  `status: 'failed'` → items settle to Uncategorized, no infinite spinner).
  - **Bug to avoid:** the transient "Uncategorized" flash. Our fix must make
    imported items show under **"Categorizing…"** during the load/classify
    window, then move to aisles — they must **not** flash "Uncategorized" first.
    Because auto-prime sets `status: 'loading'`, the existing grouping rule
    already routes them to "Categorizing…" for free. Good — lean on it.
  - **Bug to avoid:** a permanent spinner. The §A failure path (timeout/error →
    `failed` → `reset()`) already guarantees settlement; auto-prime introduces
    no new path around it.

## Relevant ADRs

- **ADR-0011 / ADR-0013** (layered matching, web-worker inference): unchanged.
  We add **no** new matching logic and don't touch the worker. We only add a new
  *trigger* for the existing `prime()` + deferred-reclassify path.
- **ADR-0015** (store-agnostic items / per-store matcher): unchanged. Auto-prime
  uses the same active-store candidate set; the existing store-switch `reset()`
  still holds.
- **ADR-0004** (ephemeral UI state in Zustand): unchanged — we reuse
  `useCategorizationStore` as-is; no new store, no schema field.
- **No new ADR required.** This is a trigger fix within the existing contracts.
- **No `DB_VERSION` bump.** No persisted state changes.

## Approach

**Decouple classification from the manual add-item signal: auto-prime the
matcher whenever the active store has unlocated catalog items.** This makes
categorization react to *data state* ("there is something to categorize") rather
than solely to "the user typed a new item." The existing deferred reclassify
loop (which keys on `isReady` flipping) then does all the actual work — no new
classification logic, no change to the no-clobber/auto rules, and the
"Categorizing…" vs "Uncategorized" distinction is preserved automatically
because auto-prime moves `status` through `loading`.

This is the minimal change that fits the established architecture: the fix lives
in `useItemClassification` (the matcher's owner), which is already mounted on the
destination route the importer navigates to.

### The change (`src/hooks/useItemClassification.ts`)

Add one effect: **auto-prime once, when the active store has at least one
unlocated catalog item and the matcher hasn't primed yet.**

```ts
// Auto-prime when the active store has unlocated catalog items, so items that
// arrived without a manual add-item signal (e.g. recipe import) get classified
// on mount. Preserves the "don't load the model for a fully-categorized list"
// optimization: a list with every item located never trips this.
useEffect(() => {
  if (hasPrimed) return;
  if (!activeStore || !itemsReady || !locationsReady) return;
  const hasUnlocated = (items ?? []).some((item) => !locatedItemIds.has(item.id));
  if (!hasUnlocated) return;
  setHasPrimed(true);
  prime();
}, [hasPrimed, activeStore, itemsReady, locationsReady, items, locatedItemIds, prime]);
```

Why this is sufficient and safe:

- **Triggers on the import case.** Mounting `/lists/:id` after import → effect
  sees the imported (unlocated) items → `prime()` → matcher loads → `isReady`
  flips → the **existing** deferred reclassify loop (`useItemClassification.ts:117`)
  classifies every unlocated item. No change to that loop is needed.
- **Preserves the lazy-load optimization.** A fully-categorized list has no
  unlocated items → `hasUnlocated` is `false` → no prime → model never loads on
  a pure view. (`prime()` is itself a no-op when `candidates.length === 0`, e.g.
  a brand-new store with no aliases — `useAisleMatcher.ts:168`.)
- **No infinite loop.** `setHasPrimed(true)` latches; the existing
  `useEffect(() => { if (hasPrimed) prime(); })` keeps the worker embedded.
  Classified items gain locations and leave the unlocated set; items that settle
  to no-aisle stay unlocated but the deferred loop won't re-fire (its deps don't
  include the items/locations sets) and this auto-prime effect won't re-fire
  (`hasPrimed` is latched).
- **Preserves the "Categorizing…" vs "Uncategorized" invariant.** Auto-prime →
  `ensureLoaded` → `status: 'loading'` (`useAisleMatcher.ts:110`) →
  `useItemClassification` publishes it to `useCategorizationStore` →
  `groupListItemsByAisle` routes the unlocated unchecked items to the
  **"Categorizing…"** group, not "Uncategorized". They only land in
  "Uncategorized" once the matcher settles them with no aisle. **No transient
  flash.**
- **Preserves the failure path.** If the worker fails/ times out, `status:
  'failed'` → existing effect `reset()`s → items settle to "Uncategorized". No
  permanent spinner.
- **Respects the `auto` no-clobber rule.** The deferred loop writes via
  `upsertLocation … auto: true`, untouched.

> **Tradeoff (acceptable, note it):** a list that retains a *genuinely*
> un-categorizable item will auto-prime (load the model) on each visit and
> re-attempt that item. This matches the spirit of "categorize automatically"
> and mirrors today's behavior the moment any item is added; the cost is one
> lazy model load per visit to such a list. If this proves heavy, a follow-up
> could track "already-attempted at this store" ids — out of scope here.

### Why not other options

- **Trigger classification from `RecipeImporter` directly.** Rejected: the
  matcher lifecycle is owned by `useItemClassification`, mounted on the
  *destination* route; `RecipeImporter` navigates away immediately after commit.
  The fix belongs where the matcher lives.
- **Add the unlocated set to the deferred loop's deps.** Rejected: re-introduces
  the classify → invalidate → re-classify loop that the existing deps comment
  guards against, and still wouldn't fire without a prime. Auto-prime + the
  existing `isReady`-keyed loop is both sufficient and loop-free.
- **Prime on every mount.** Rejected: regresses the deliberate lazy-load
  optimization for fully-categorized lists. Gating on `hasUnlocated` keeps it.

## Files to change

| File | Change |
| --- | --- |
| `src/hooks/useItemClassification.ts` | add the single auto-prime effect (above). No other behavior changes. |

No component, store, grouping, worker, schema, or ADR changes.

## Tests

- **`src/hooks/__tests__/useItemClassification.test.ts` (extend):**
  - With an active store, `itemsReady` + `locationsReady`, and an **unlocated**
    catalog item present and the form never blurred/submitted → `prime` is
    called (auto-prime) and, once the matcher readies, the deferred loop
    classifies the unlocated item (spy `prime` / `classify` / `upsertLocation`).
  - With **all** items located → `prime` is **not** called (lazy-load preserved).
  - Auto-prime fires **once**: latches via `hasPrimed`; re-renders / items
    changes don't cause repeated `prime` storms beyond the idempotent keep-warm.
  - Regression: the existing blur/submit prime path and the `auto` no-clobber
    behavior still hold.
- **E2E (Playwright) — required (per CLAUDE.md, `validate` won't catch this):**
  extend `e2e/recipe-import.spec.ts` (or a sibling): mock `/api/import-recipe`,
  import ingredients to a **new list**, land on `/lists/:id`, and assert the
  items **categorize without any manual add** — i.e. they appear under
  **"Categorizing…"** and then move into aisle groups (or settle to
  "Uncategorized" only if genuinely unmatchable), with the Add-item field
  **never touched**. This is the exact regression that unit tests can't prove.
  - Also assert the **no-flash** property where feasible: imported items are not
    shown under the "Uncategorized" header during the load window.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — confirm imported items categorize with no manual add,
   via "Categorizing…" → aisles, no "Uncategorized" flash, no permanent spinner.
3. Manual smoke: import to a new list and to an existing list; confirm both
   auto-categorize. Confirm a fully-categorized list still opens without loading
   the model (no "Categorizing…" group appears for already-placed items).

## Out of scope

- Default-list categorization (by design, default items are store-agnostic).
- Any change to the matcher, thresholds, or lexical/semantic layering
  (ADR-0011/0013).
- Persisting categorization status or an "already-attempted" id set (possible
  follow-up for the genuinely-uncategorizable re-attempt cost).
- Changes to checked-item rendering, the Done group, or the manual-pick UX.
