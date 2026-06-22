---
status: active
class: complex
e2e_required: true
clarifications: |
  Decisions from the kickoff Q&A:
  - List ↔ store model = "List follows you, re-aisles." A single shopping list is
    store-agnostic; switching the active store re-buckets its items into the
    newly-active store's aisle layout. This is the core requirement: the
    "write list → switch store" and "switch store → write list" journeys must
    both work against the same list.
  - Scope = "Full switcher + Big Y." This task implements real, persisted active-
    store switching (none exists today — `useActiveStore()` just returns
    `stores[0]` and the switcher sheet is cosmetic), makes items/aisles/matcher
    store-aware, AND seeds the Worcester Big Y store.
  - Big Y data source = `docs/prd/big-y-mayfield-st-worcester.json`. The user
    has since supplied the REAL Big Y layout: 18 numbered center aisles (with
    category descriptions) + perimeter departments (Produce, Floral, Bakery,
    Natural & Living Well, Deli & Kitchen, Seafood, Meat & Butcher, Dairy,
    Pharmacy) + Checkout. That file now holds the full structured aisle layout
    (`store` + `aisles[]`). The only authored part remaining is mapping the
    SHARED canonical item catalog onto these real Big Y aisles (item_locations),
    which is what makes Model B's re-aisling observable. (Center aisles are no
    longer invented — open item #1 is resolved.)
---

# Task: Add Worcester Big Y as a switchable store (store-agnostic lists that re-aisle)

## Problem

"Big Y" is currently a hardcoded **"Coming soon"** placeholder in
`StoreSwitcherSheet`, and store switching does not actually work:

- `useActiveStore()` returns `stores[0]` — there is no persisted active store.
- `StoreSwitcherSheet` selection only calls `onClose()`; it never changes state.
- `useItems()` / `useAisles()` (no arg) fetch **all** items / aisles regardless
  of store; new items are created against `stores[0]`.
- `useAisleMatcher` + the worker are **hardcoded** to `oxford-62.json` /
  `oxford-62-aliases.json` and resolve by `aisle.number`, which only maps onto
  the Market Basket aisle set.
- `items` are per-store (`store_id` + `aisle_id` on each `Item`), and
  `list_items` reference a store-specific `item_id`, so a list literally points
  at one store's catalog rows.

To add Big Y as a real option AND let one list work at either store (in either
journey order), we must (1) persist an active store, (2) make the catalog,
aisle views, and matcher store-aware, and (3) decouple list/item identity from a
single store so a list re-aisles when the active store changes.

## Decision: data model for "lists follow you, re-aisle per store" (Model B)

Today item identity is coupled to a store (`Item.store_id`, `Item.aisle_id`).
For one list to re-aisle across stores we normalize that coupling:

- **`items` become store-agnostic** — `{ id, name, canonical_name }`. Drop
  `aisle_id` and `store_id` from `Item`.
- **New `item_locations` object store** — `{ id, item_id, store_id, aisle_id }`,
  the per-store aisle assignment for a catalog item. Indexes: `item_id`,
  `store_id`. A manual recategorization writes/updates only the
  `(item_id, active_store_id)` location, so fixing "Milk" at Market Basket never
  clobbers its Big Y aisle.
- **The override invariant moves with the aisle.** Today a manual aisle is
  protected by the implicit lock `Item.aisle_id !== ''` (the classifier only
  ever touches `aisle_id === ''` items — see `AddItemForm`). With `aisle_id`
  gone from `Item`, that lock signal becomes **"a location row exists for
  `(item_id, active_store_id)`."** The override must hold *per store, within a
  store*: an auto-classify resolving late must never overwrite a manual pick the
  user made for that store while it was in flight. This is the same clobber race
  `complete--manual-categorize-uncategorized.md` (Part B) closed; Model B
  re-opens it per store unless we carry the guard into the location upsert
  (below). Note: the planned `auto?` write-time guard from that task was never
  actually landed in `useUpdateItemAisle` — today's protection is purely the
  read-side filters in `AddItemForm` — so this must be built fresh, not ported.
- **`list_items` unchanged** (`item_id` now points at a store-agnostic item), so
  lists are inherently store-agnostic. ✅ "List follows you."
- **Shopping view** resolves each list item's aisle via its `item_location` for
  the **active** store; switching store re-buckets everything. Unlocated items
  fall into "Uncategorized" and trigger classification against the active
  store's aisles, which writes a new `item_location`. ✅ Re-aisle.
- **Active store** persisted in a new **`preferences`** object store
  (`{ key, value }`), `key = 'active_store_id'` (per the backlog's "preferences
  key in IndexedDB" note). `useActiveStore()` reads it (default: first store).

This is a real data-model change, so it gets a **new ADR** (see below). It does
not contradict ADR-0011; it generalizes the matcher to be store-parametrized.

## Relevant ADRs

- **ADR-0002 (IndexedDB for core storage)** — still the persistence substrate.
  Adding `item_locations` + `preferences` object stores and a normalized item
  shape is consistent; migration is append-only (new `if (oldVersion < 3)` case).
- **ADR-0011 (layered lexical + semantic aisle matching)** — NOT contradicted.
  The scoring functions in `classifier.ts` are already pure and store-neutral
  (they take items + aliases + an `aisleById` map). We generalize the *inputs*:
  the worker/hook are parametrized by the **active store's** candidate set
  (its `item_locations`-derived item→aisle map + that store's alias file) instead
  of importing `oxford-62.*` at module scope. ADR-0011 explicitly anticipated
  "per-store alias files later," so this is the planned evolution, not a deviation.
- **ADR-0009 (on-demand shopping list model)** — lists stay on-demand; we only
  remove their implicit single-store assumption. No deviation.
- **ADR-0013 (web-worker aisle inference)** — worker stays the inference home;
  we change *what data it embeds* (active store's candidates), not where it runs.

### New ADR required

Add **`docs/adrs/0015-store-agnostic-items-and-active-store.md`** (status
Accepted) documenting: store-agnostic `items` + per-store `item_locations`,
the `preferences`-backed active store, and the store-parametrized matcher.
Per CLAUDE.md, ADRs are immutable once accepted — this is a new record, not an
edit of 0011/0002.

## Big Y data (real layout now supplied)

`docs/prd/big-y-mayfield-st-worcester.json` now holds the **real, full layout**
the user supplied:
- `store`: name, address, `slug: "big-y-worcester"`.
- `aisles[]`: **18 numbered center aisles** (1–18, each with a `label` and a
  `categories` description) + **perimeter departments** (Produce, Floral, Bakery,
  Natural & Living Well, Deli & Kitchen, Seafood, Meat & Butcher Shop, Dairy,
  Pharmacy) + Checkout. `number` mirrors the oxford-62 convention (digit strings
  for numbered aisles, `"<X> Dept"` for perimeter departments). `sort_order` is a
  sensible default shopping path (front → center aisles → dairy → pharmacy →
  checkout) that the user can reorder later via the existing drag-and-drop.

The only thing still authored by us is the **item→aisle mapping**: Big Y has a
real aisle layout but no item catalog, and Model B's re-aisling is only visible
if the same items exist at both stores. Because `items` are now store-agnostic,
the catalog is shared automatically; we author a Big Y **`item_locations`** set
(each shared catalog item → a Big Y aisle, guided by the per-aisle `categories`
text) + a Big Y alias file. The mapping is a best-effort draft the user can
correct later — same caveat ADR-0011 records for the oxford-62 mis-filings.

Authored assets:
- `src/assets/aisles/big-y-worcester.json` — seed shape
  (`{ store, aisles, item_locations }`; `slug: "big-y-worcester"`, fresh UUIDs),
  generated from `docs/prd/big-y-mayfield-st-worcester.json`.
- `src/assets/aisles/big-y-worcester-aliases.json` — matcher-only aliases,
  keyed by Big Y aisle `number` (mirrors `oxford-62-aliases.json`).
- `public/store-logos/big-y-worcester.png` — **provided** (added to the repo by
  the user); rendered by `StoreLogo` for the `big-y-worcester` slug.

## Approach (phased)

### Phase 1 — Schema & migration (data layer)

1. `src/db/schema.ts`
   - `Item` → `{ id, name, canonical_name }` (remove `aisle_id`, `store_id`).
   - Add `interface ItemLocation { id, item_id, store_id, aisle_id }`.
   - Add `interface Preference { key: string; value: string }`.
   - Extend `ShoopDB`: `item_locations` (indexes `item_id`, `store_id`),
     `preferences` (`key` PK). Bump `DB_VERSION` 2 → 3.
2. `src/db/idbClient.ts`
   - New `if (oldVersion < 3)` migration case (append-only): create
     `item_locations` (+ indexes) and `preferences`; then **data-migrate** —
     read every existing `items` row, write an `item_locations` row from its
     `store_id`/`aisle_id`, and rewrite the item without those fields.
   - Seed: import both `oxford-62.json` and `big-y-worcester.json`; seed both
     stores, their aisles, the shared `items` (de-duped by `id`), and per-store
     `item_locations`. Seed `preferences.active_store_id` = oxford-62 by default.
   - `resetUserData()`: re-seed both stores + aisles + items + item_locations and
     reset `active_store_id`; clear `preferences` user keys appropriately.

### Phase 2 — Active store persistence

3. `src/hooks/usePreferences.ts` (new) — `useActiveStoreId()` (reads
   `preferences.active_store_id`, default first store id) + `useSetActiveStoreId()`
   (writes it, invalidates `['preferences','active_store_id']` and dependent keys).
4. `src/hooks/useStores.ts` — `useActiveStore()` returns the store whose id is the
   active preference (fallback `stores[0]`).

### Phase 3 — Store-aware catalog, aisles, matcher

5. `src/hooks/useItems.ts` — `useItems()` stays catalog-wide (store-agnostic);
   add `useItemLocations(storeId)` and `useUpsertItemLocation()` (replaces
   `useUpdateItemAisle`'s per-store-write semantics: upsert
   `(item_id, store_id) → aisle_id`). **The upsert must preserve the override
   invariant** by taking an `auto?: boolean` (default `false` = manual), exactly
   like the completed task's plan but at the location grain:
   - **Manual (`auto` falsy):** unconditional upsert of the
     `(item_id, store_id)` location — a manual pick always wins.
   - **Auto (`auto: true`):** re-read inside the mutation and **skip the write
     if a location row already exists for `(item_id, store_id)`** (a manual
     choice for that store is already set — do not clobber). This is the
     per-store generalization of the old `aisle_id !== ''` lock.
6. `src/hooks/useListItems.ts` — add flow creates a store-agnostic item
   (no `store_id`/`aisle_id`); classification result is written as an
   `item_location` for the **active** store, not onto the item.
   - **Re-key the classify trigger.** Today `AddItemForm` only classifies
     newly-created items (`result.itemCreated`) and items with `aisle_id === ''`.
     In Model B neither signal is correct: a re-added *existing* catalog item
     that has **no location for the active store** must still classify (that is
     the whole re-aisle premise — `itemCreated` would be `false` and wrongly
     skip it, stranding it in Uncategorized at the new store). The trigger
     becomes **"the item has no `item_location` for the active store yet,"** and
     the write goes through the `auto: true` path in step 5 so an existing
     manual location for that store is still never overwritten. `itemCreated`
     stays only as the signal for whether the shared `items` query needs
     invalidating, not for whether to classify.
7. `src/hooks/useAisleMatcher.ts` + `src/workers/aisleMatcher.worker.ts` +
   `src/services/classifier.ts`
   - Remove module-scope `oxford-62.*` imports from the hook/worker.
   - Parametrize by the active store: candidate set built from the active store's
     item→aisle map (`item_locations` joined to `items`) + that store's alias file.
   - Worker `load` accepts the active store's candidates and (re)embeds on store
     change. Note a follow-up optimization: cache embeddings keyed by phrase so a
     store switch only remaps `aisleNumber` labels instead of re-embedding.
   - `classifier.ts` stays pure; only its inputs change (already store-neutral).

### Phase 4 — UI wiring

8. `src/components/molecules/StoreSwitcherSheet.tsx` — remove the hardcoded
   "Big Y — Coming soon" row; selecting a store calls `useSetActiveStoreId()` then
   closes. Highlight the active store (already supported).
9. `src/components/organisms/StoreHeader.tsx` — pass the setter; header reflects
   the persisted active store.
10. `src/components/organisms/ShoppingListBuilder.tsx` — bucket by the active
    store's `item_locations` (not `item.aisle_id`); `useAisles(activeStoreId)`;
    aisle changes call `useUpsertItemLocation()`.
11. `src/components/organisms/AddItemForm.tsx` — classify against the active
    store's aisles; write the result as an `item_location` via the `auto: true`
    path. Both classify sites change their guard from `aisle_id === ''` /
    `result.itemCreated` to **"no `item_location` for the active store":**
    - the on-add `onSuccess` classify, and
    - the `isReady` deferred-reclassify loop, whose filter becomes "list/catalog
      items lacking a location for the active store." Because store switching
      re-embeds the matcher (step 7), this loop must also re-run on active-store
      change so items unlocated at the newly-active store get classified there.
12. Reconcile the manual-categorize-uncategorized flow (completed task) to the
    per-store upsert.

## Files to change

| File | Change |
| --- | --- |
| `src/db/schema.ts` | Store-agnostic `Item`; add `ItemLocation`, `Preference`; new stores; `DB_VERSION` → 3. |
| `src/db/idbClient.ts` | v3 migration (create stores + data-migrate items→item_locations); seed Big Y + both stores; reset logic. |
| `src/assets/aisles/big-y-worcester.json` | **New** seed (store + drafted aisles + shared-catalog item_locations). |
| `src/assets/aisles/big-y-worcester-aliases.json` | **New** matcher-only aliases. |
| `public/store-logos/big-y-worcester.png` | **New** (optional; graceful fallback). |
| `src/hooks/usePreferences.ts` | **New** active-store read/write. |
| `src/hooks/useStores.ts` | `useActiveStore()` reads the active preference. |
| `src/hooks/useItems.ts` | Store-agnostic items; `useItemLocations`, `useUpsertItemLocation`. |
| `src/hooks/useListItems.ts` | Add flow creates store-agnostic items; classify → item_location. |
| `src/hooks/useAisleMatcher.ts`, `src/workers/aisleMatcher.worker.ts` | Store-parametrized candidate set + re-embed on store change. |
| `src/components/molecules/StoreSwitcherSheet.tsx` | Real selection; drop "Coming soon" Big Y. |
| `src/components/organisms/StoreHeader.tsx` | Wire the setter. |
| `src/components/organisms/ShoppingListBuilder.tsx` | Bucket by active store's item_locations. |
| `src/components/organisms/AddItemForm.tsx` | Classify against active store; write item_location. |
| `docs/adrs/0015-store-agnostic-items-and-active-store.md` | **New** ADR. |

## Implementation checklist

- [ ] ADR-0015 written and Accepted.
- [ ] Schema + `DB_VERSION` 3; `item_locations` + `preferences` stores.
- [ ] v3 migration data-migrates existing items → item_locations (idempotent, append-only).
- [ ] Big Y seed assets authored from the real layout (aisles + shared-catalog item_locations + aliases).
- [ ] Active-store preference persistence (`usePreferences`, `useActiveStore`).
- [ ] Store-aware items/aisles/matcher.
- [ ] Override invariant preserved per store: `useUpsertItemLocation` auto-writes
      skip when a location already exists for the active store; manual picks are
      unconditional; classify trigger re-keyed to "no location for active store."
- [ ] Switcher selects + persists; header reflects it; "Coming soon" removed.
- [ ] Shopping view re-buckets on store switch; uncategorized re-classifies per store.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` green.

## Tests

### Unit / integration (Vitest + RTL, fake-indexeddb)
- **Migration**: seeding v3 fresh creates both stores, shared items, per-store
  item_locations, and `active_store_id`. Upgrading a v2 DB moves each item's
  `store_id`/`aisle_id` into an `item_location` and strips them from the item.
- **usePreferences / useActiveStore**: default = first store; after set, persists
  and is read back.
- **useItemLocations / useUpsertItemLocation**: per-store upsert does not affect
  the other store's location for the same item.
- **Override invariant (per-store clobber regression)**: manual upsert (`auto`
  omitted) overwrites an existing location; auto upsert (`auto: true`) writes
  only when no location exists for `(item_id, store_id)` and is a **no-op when a
  location for that store already exists**. Simulate the race: manual-pick aisle
  X at store B, then fire an `auto: true` classify with a *different* aisle for
  store B; assert the stored location is still X (the manual choice survives).
  This is the Model B counterpart of the completed task's cross-list revert test.
- **classifier.ts**: unchanged pure-function tests still pass; add a case proving
  the same phrase resolves to different aisle numbers under two stores' inputs.
- **ShoppingListBuilder**: a list with one item buckets into store A's aisle, and
  after switching to store B re-buckets into store B's aisle (or Uncategorized if
  unlocated).
- **StoreSwitcherSheet**: selecting a store calls the setter; active store shows
  the check; no "Coming soon" row.

### E2E (Playwright) — new `e2e/store-switch-reaisle.spec.ts`
- Both journeys against ONE list:
  1. **write → switch**: build a list at Market Basket, switch to Big Y via the
     header switcher, confirm items re-bucket under Big Y aisles and the header +
     persisted store update (survives reload).
  2. **switch → write**: switch to Big Y first, build a list, confirm items
     classify into Big Y aisles.

## Validation
1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — store-switch re-aisle flow green.

## Out of scope
- Creating/editing/deleting stores or aisles from the UI (Store detail stays
  read-only; reuse existing `/stores/:id`).
- The embedding-cache optimization for store switches (noted as a follow-up).
- A real, surveyed Big Y center-aisle layout/item catalog — this task ships a
  drafted layout the user can correct (data-quality pass is separate, per
  ADR-0011's precedent).
- Per-store default lists.

## Open items to confirm before/while building
1. ~~Big Y layout/items~~ — **RESOLVED.** User supplied the real aisle layout
   (now in `docs/prd/big-y-mayfield-st-worcester.json`). We reuse the shared
   catalog and map each item onto Big Y's real aisles (best-effort draft).
2. ~~Big Y logo~~ — **RESOLVED.** Added at
   `public/store-logos/big-y-worcester.png`.
