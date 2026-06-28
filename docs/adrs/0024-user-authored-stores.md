# Allow user-authored stores from an AI-generated JSON import

## Status

Accepted

## The Problem

A user shops at stores Shoop doesn't ship a bundled aisle survey for, and there
is no public aisle/inventory data to seed them from.

## The Solution

Let the user add their own store by importing an AI-generated JSON file (upload
or paste) that lists the store's ordered aisles plus a handful of representative
items per aisle, which become `item_locations` so the existing semantic matcher
classifies real items into the custom store's aisles.

## Options Considered

- **Import an AI-generated JSON of aisles + representative items per aisle**
  (upload or paste), minting all ids/slugs ourselves.
- A blank-store builder where the user types aisles by hand (no classification
  seeds, so the matcher has nothing to anchor on for a brand-new store).
- A server-side store directory or scraper (violates the offline-only,
  no-backend constraint in ADR-0001/ADR-0002).

## Rationale

- **Rides ADR-0015 with no schema change.** User stores reuse the existing
  shape exactly: items stay in the shared, store-agnostic catalog; the custom
  store contributes `aisles` + per-store `item_locations`. No new object store,
  no `DB_VERSION` bump, so the ADR-0017 migration gate is not triggered.
- **Representative items are the classification seeds.** The matcher's candidate
  set per store comes from `item_locations` + per-slug bundled aliases
  (ADR-0011 / ADR-0013, `buildAisleCandidates`). User stores carry no bundled
  alias asset, so their candidates come entirely from the imported
  `item_locations` — which is why the prompt asks for example items per aisle.
- **Offline, single code path.** Upload and paste both feed one pure
  parser/validator; creation is one local IndexedDB transaction. Nothing in the
  flow needs the network.

## Notes

- **We mint all ids and the slug.** Any `id`/`store_id`/`slug` present in the
  uploaded JSON is ignored to avoid colliding with seeded UUIDs. The slug is
  derived by slugifying `name`, then de-duped against existing store slugs
  (`-2`, `-3`, …) so logo/alias lookup never aliases onto a bundled store.
- **No bundled logo or alias asset.** Custom stores fall back to the generic
  `faStore` badge (ADR-0007); `StoreLogo` already handles unknown slugs.
- **Wiped by "Reset all data."** `resetUserData()` clears and re-seeds only the
  three bundled stores, so a custom store (and any catalog items it introduced)
  is removed by a reset. This matches the existing Danger Zone copy and is
  intentional.
- Cites ADR-0015, ADR-0011, ADR-0013, ADR-0007, ADR-0005, ADR-0006.
- Editing/deleting a custom store after import is out of scope (aisles are
  already reorderable on the store detail page via `useReorderAisles`).
