# Custom Store via JSON Upload

## Goal

Let the user add their own store from an AI-generated JSON file (upload **or**
paste), reachable from the Settings page beneath the existing store list. The
entry routes to a new page that (1) explains briefly how a custom store works,
(2) offers a **Copy prompt** button that puts a ready-made AI prompt on the
clipboard, and (3) accepts the resulting JSON, validates it, previews it, and
creates the store.

## Confirmed product decisions

- **Classification model: representative items per aisle.** The AI prompt asks
  for the store's ordered aisles plus a handful (~10–20) of example grocery
  items per aisle. On import those become `item_locations` rows for the new
  store, so the existing semantic matcher (ADR-0011 / ADR-0013 / ADR-0015)
  classifies the user's real items into the custom store's aisles from day one.
- **Input: file upload _and_ paste.** A file picker (`<input type="file"
  accept="application/json,.json">`) plus a paste-into-`<textarea>` fallback,
  parsed through one identical code path. Both work fully offline.

## Relevant ADRs (constraints honored)

- **ADR-0015 (store-agnostic items + per-store `item_locations` + active
  store).** This feature rides ADR-0015 exactly: items stay in the shared
  catalog; the custom store contributes aisles + `item_locations`. The seeded
  representative items are classification seeds and double as the per-store
  aisle map — the same shape the General Store already ships. **No contradiction;
  no new object stores; no `DB_VERSION` bump.**
- **ADR-0011 / ADR-0013 (layered, store-parametrized aisle matching).** The
  matcher's candidate set is built from `item_locations` + per-slug aliases
  (`buildAisleCandidates`). Custom stores have no bundled alias asset, so their
  candidates come entirely from the imported `item_locations` — which is why the
  representative-items model is required for good classification.
- **ADR-0006 (React Router v7 library mode).** New route added to the
  `createBrowserRouter` config in `src/App.tsx`.
- **ADR-0005 (Atomic Design).** New screen = a thin route delegating to an
  organism; pure parse/validate logic lives in `utils/` (testable, no IDB).
- **ADR-0007 (Font Awesome fallback for logoless stores).** Custom stores have
  no `/store-logos/<slug>.png`; `StoreLogo` already falls back to a generic
  `faStore` badge for unknown slugs — no change needed.

## Architecture notes discovered

- Stores/aisles/items/item_locations are seeded from bundled JSON assets via
  `seedDatabase()` / the `upgrade()` migrations in `src/db/idbClient.ts`. **User
  stores are different in kind: IndexedDB-only, additive, never part of the seed
  or migration path.**
- `resetUserData()` clears `stores`/`aisles`/`items`/`item_locations` and
  re-seeds the three bundled stores only. **Therefore a custom store (and any
  catalog items it introduced) is wiped by "Reset all data."** This matches the
  existing Danger Zone copy ("Your store and aisle layout will be restored to
  default") — acceptable and intentional; called out in the new ADR.
- `useStores()` sorts `general` last; custom stores sort in their natural
  (insertion) position ahead of it — no change required.
- `crypto.randomUUID()` is the mandated id scheme for every row.

## JSON contract (what the prompt asks the AI to produce)

```jsonc
{
  "name": "Trader Joe's — Cambridge",          // required, non-empty
  "address": "748 Memorial Dr, Cambridge MA",  // optional, free text
  "aisles": [                                   // required, >= 1
    {
      "number": "1",                            // optional display key; defaults to index+1
      "label": "Produce",                       // required, non-empty
      "items": ["banana", "spinach", "avocado"] // optional; representative items for classification
    }
  ]
}
```

Authoring rules baked into both the prompt and the validator:

- **We mint all ids ourselves** (`crypto.randomUUID()`); any `id`/`store_id`/
  `slug` present in the uploaded JSON is ignored to avoid collisions with seeded
  UUIDs and to keep slugs unique.
- `slug` is derived by slugifying `name`, then de-duped against existing store
  slugs (suffix `-2`, `-3`, …) so logo lookup and alias lookup never alias onto
  a bundled store.
- `sort_order` comes from aisle array order; `number` defaults to `index + 1`
  when omitted.
- `items` are normalized to `canonical_name` (lowercased/trimmed). For each:
  reuse an existing catalog item with the same `canonical_name` if present,
  otherwise create a new `items` row. Then write one `item_locations` row for
  `(item_id, newStoreId, aisleId)`. Duplicate items within a store collapse to
  one location.

## Implementation steps

### 1. ADR — document the new pattern
- Add `docs/adrs/0024-user-authored-stores.md`: user stores are IndexedDB-only,
  additive, classified via imported `item_locations` (riding ADR-0015), carry no
  bundled logo/alias asset, require no schema change, and are wiped by
  `resetUserData()`. Cite ADR-0015, ADR-0011/0013, ADR-0007.

### 2. Pure parser/validator — `src/utils/parseStoreImport.ts` (+ `__tests__`)
- `parseStoreImport(rawText: string): StoreImportResult` — `JSON.parse` with a
  caught error → friendly message; structural validation (name present, aisles
  non-empty, each aisle has a label); returns a normalized, typed
  `ParsedStoreImport { name, address, aisles: { number, label, sortOrder,
  items: string[] }[] }` or a list of human-readable errors.
- `slugify(name)` helper here (pure). No IDB, no React — fully unit-tested.
- Keep all id/slug minting out of this module (that needs the existing-store
  list); this module only validates + normalizes shape.

### 3. Prompt text — `src/utils/storeImportPrompt.ts`
- Export `STORE_IMPORT_PROMPT` (a const string): instructs an AI to output
  **only** JSON matching the contract above, with the field rules and an
  example. Single source of truth shared by the copy button and used to keep the
  validator and prompt in lockstep (a test asserts the prompt's example parses
  cleanly through `parseStoreImport`).

### 4. Create mutation — `src/hooks/useImportStore.ts`
- `useImportStore()` TanStack mutation taking a `ParsedStoreImport` + the current
  store list (for slug de-dup). In one `readwrite` transaction over
  `['stores','aisles','items','item_locations']` (queue synchronously, single
  commit — same idiom as `seedDatabase`/`resetUserData`):
  - add `stores` row (minted id, derived unique slug);
  - add `aisles` rows (minted ids, `store_id`, `number`, `label`, `sort_order`);
  - resolve/create `items` by `canonical_name` (read existing catalog before the
    tx; create missing within it);
  - add `item_locations` rows linking item → aisle for the new store.
- `onSuccess`: invalidate `['stores']`, `['aisles']`, `['items']`,
  `['item_locations']`; return the new store id.
- Does **not** auto-switch the active store (user does that from the detail page,
  which already has "Set as current store").

### 5. Organism — `src/components/organisms/StoreImporter.tsx`
- Mirrors `RecipeImporter`'s shape. Sections:
  - Short "How a custom store works" overview copy.
  - **Copy prompt** button → `navigator.clipboard.writeText(STORE_IMPORT_PROMPT)`
    with a transient "Copied!" confirmation (graceful fallback: select-all in a
    readonly field if clipboard API unavailable).
  - File picker + paste `<textarea>`, both feeding `parseStoreImport`.
  - Inline validation errors; on success, a small preview (store name + aisle
    count + total representative items) and a **Add store** confirm button.
  - On create, navigate to `/stores/:id` (the new store's detail page).
- Reuse existing atoms (`Button`) and molecules; check for an existing
  copy-to-clipboard helper before adding one.

### 6. Route — `src/routes/AddStoreRoute.tsx` + wire into `src/App.tsx`
- New route `path: 'stores/new'` rendering `<AddStoreRoute />` → `<StoreImporter/>`.
- Place the child route before/after `stores/:id` (literal `new` won't collide
  with the `:id` param in RRv7, but order it before to be explicit).

### 7. Settings entry — `src/routes/SettingsRoute.tsx`
- Under the "Your Stores" section (beneath the store list), add a `NavLink` to
  `/stores/new` styled like the existing Default List / Import rows ("Add a
  store" with a chevron).

### 8. Tests
- **Unit:** `parseStoreImport` (valid, malformed JSON, missing name, empty
  aisles, missing label, item normalization/dedup, slug derivation); a test that
  `STORE_IMPORT_PROMPT`'s embedded example parses cleanly.
- **Integration (RTL):** `StoreImporter` — paste valid JSON → preview → add →
  navigates; paste invalid JSON → error; Copy prompt writes to a mocked
  clipboard. `SettingsRoute` shows the "Add a store" link.
- **E2E (Playwright):** Settings → Add a store → paste JSON → store appears in
  the store list and its detail page lists the imported aisles. (Run
  `npm run test:e2e` — `validate` does not cover it.)

## Out of scope (note in plan, not built)

- Editing/deleting a custom store after import (aisles are already reorderable on
  the detail page via existing `useReorderAisles`).
- Per-store alias assets or custom logos for user stores (icon fallback only).
- Sharing/exporting a created store (separate backlog "Sharing" item).

## Validation / done criteria

- `npm run validate` green (typecheck + lint + unit).
- `npm run test:e2e` green.
- Manual: add a store from a sample JSON, confirm it appears in Settings,
  open it, set it active, add a real item, and see it bucket into a sensible
  aisle.

## Commit / release notes

- Conventional Commits. Feature commits are `feat:` — but **no `DB_VERSION`
  bump** occurs, so this is not a schema-migration feat (ADR-0017 CI gate is not
  triggered). Confirm with the user whether any commit here is breaking (it
  should not be — purely additive).
