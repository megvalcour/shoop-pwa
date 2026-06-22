# Store-agnostic items with per-store item locations and a persisted active store

## Status

Accepted

## The Problem

A single shopping list must work at more than one store: the same list should
re-bucket its items into whichever store's aisle layout is currently active,
without duplicating the list or its items per store.

## Options Considered

- **Keep item identity coupled to a store** (`Item.store_id` + `Item.aisle_id`,
  as in ADR-0002's original shape) and duplicate the catalog/list per store —
  rejected: a list literally points at one store's catalog rows, so "the same
  list at another store" is impossible without copying.
- **Store-agnostic `items` + a per-store `item_locations` join, plus a
  `preferences`-backed active store** (selected).

## Rationale

For one list to follow the shopper across stores, item identity must be
decoupled from any single store:

1. **`items` become store-agnostic** — `{ id, name, canonical_name }`. The
   `aisle_id`/`store_id` columns are dropped.
2. **`item_locations`** — `{ id, item_id, store_id, aisle_id }` records the
   per-store aisle assignment for a catalog item (indexes: `item_id`,
   `store_id`). A manual recategorization writes only the
   `(item_id, active_store_id)` row, so fixing an item's aisle at one store
   never clobbers its placement at another.
3. **`list_items` are unchanged** — they reference a store-agnostic `item_id`,
   so lists are inherently store-agnostic. The shopping view resolves each list
   item's aisle through its `item_location` for the *active* store; switching
   the active store re-buckets everything.
4. **Active store** is persisted in a new `preferences` object store
   (`{ key, value }`, `key = 'active_store_id'`), read by `useActiveStore()`
   (default: the first store).

### The override invariant moves with the aisle

Previously a manual aisle pick was protected by the implicit lock
`Item.aisle_id !== ''` (the classifier only touched items with an empty aisle).
With `aisle_id` gone from `Item`, the lock signal becomes **"an `item_location`
row exists for `(item_id, active_store_id)`."** The invariant must hold *per
store*: a late auto-classify must never overwrite a manual pick made for that
store while it was in flight. `useUpsertItemLocation` carries this guard — a
manual upsert is unconditional, while an `auto: true` upsert re-reads inside the
mutation and skips the write when a location for `(item_id, store_id)` already
exists. The classify trigger is re-keyed from "item has no aisle" to "item has
no location for the active store," so a re-added existing item still classifies
into the newly-active store.

### Matcher is store-parametrized, not store-specific

This does not contradict ADR-0011 (layered lexical + semantic matching) or
ADR-0013 (web-worker inference). The scoring functions in `classifier.ts` stay
pure and store-neutral; only their *inputs* change. The matcher's candidate set
is now built from the active store's `item_locations`-derived item→aisle map
plus that store's alias file, instead of importing `oxford-62.*` at module
scope. ADR-0011 explicitly anticipated per-store alias files, so this is the
planned evolution. The worker re-embeds when the active store changes.

## Notes

- Migration is append-only per ADR-0002: a new `if (oldVersion < 3)` case
  creates `item_locations` + `preferences`, data-migrates each existing item's
  `store_id`/`aisle_id` into an `item_location`, and strips those fields from
  the item.
- The Worcester Big Y layout ships as a best-effort drafted item→aisle mapping
  the user can correct later, the same data-quality caveat ADR-0011 records for
  the oxford-62 mis-filings.
- Follow-up optimization (out of scope here): cache worker embeddings keyed by
  phrase so a store switch only remaps aisle labels instead of re-embedding.
