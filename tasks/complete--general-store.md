---
status: complete
class: complex
e2e_required: true
clarifications: |
  Decisions taken up front (none blocking; spec was clear):
  - Logo = Font Awesome icon, not a PNG. Using `faCarrot` (on-brand for a
    grocery app; `faListUl` is the documented alternative). Both are confirmed
    present in `@fortawesome/free-solid-svg-icons` v7 (the version already in
    package.json). No new dependency, satisfying ADR-0007.
  - The "general" store ships with the SAME shared catalog as the other stores,
    mapped onto invented generic sections via `item_locations` (mirrors the Big Y
    pattern). This makes re-aisling immediately observable and gives good
    out-of-box matching, since `buildCandidates` feeds both the lexical and
    semantic paths from `item_locations` + aliases.
  - Sections are a best-effort generic layout the user can reorder (drag-and-drop
    already works) and is not a surveyed real store — same caveat ADR-0011
    records for the oxford-62 mis-filings.
---

# Task: Add a built-in "General Store" for shopping at any not-yet-loaded store

## Problem / Goal

Today the app only knows two real, surveyed stores (Oxford Market Basket #62 and
Big Y Worcester). When the user shops somewhere that has not been loaded into the
app, there is no store to switch to — the list cannot be aisle-organized against
anything generic.

Add a built-in **"General Store"**: a store seeded with an invented set of
generic sections that cover the common areas of most grocery stores. It must
behave exactly like a real store everywhere it already matters:

- It appears as an entry under **Your Stores** on the Settings page.
- It is selectable in the **store switcher** and can be set as the current store.
- Its sections appear on the **store detail** screen and can be **reordered**
  (drag-and-drop) like any other store's aisles.
- Items on a list **re-aisle** into its sections when it is the active store.
- It has a recognizable **logo**: a Font Awesome icon (carrot) instead of a PNG,
  since this is a generic, non-branded store.

## Relevant ADRs (constraints — no contradictions, this is additive)

- **ADR-0015 (store-agnostic items + active store + store-parametrized matcher)**
  — This is the governing pattern. A store = `{ store, aisles[], item_locations[] }`
  seed asset + a `<slug>-aliases.json` matcher file + a row in `aliasesForSlug`.
  Adding the General Store is exactly the additive case this ADR was built for;
  no schema reshape, just one more seeded store. **No new ADR required.**
- **ADR-0011 (layered lexical + semantic matching)** — The General Store's
  sections become matchable through the same machinery: `buildCandidates` emits
  candidate phrases from this store's `item_locations` (joined to the shared
  `items`) **and** from its alias file, and both feed the lexical fast-path and
  the semantic fallback. ADR-0011 explicitly anticipated per-store alias files.
- **ADR-0002 (IndexedDB for core storage)** — Migration stays append-only: a new
  `if (oldVersion < 7)` case grafts the General Store into already-populated
  installs, mirroring the Big Y backfill in the v4/v5 cases.
- **ADR-0007 (Font Awesome Free for icons)** — The logo fallback uses
  `faCarrot` from `@fortawesome/free-solid-svg-icons` (already a dependency);
  nothing new is added.

## Design

### 1. The store identity

- **slug:** `general`
- **name:** `General Store`
- **address:** `Common grocery layout` (renders as the muted subtitle under the
  name in StoreListEntry / StoreDetail — used here as a one-line description
  rather than a street address).
- **id:** a fresh UUID v4 generated once and hard-coded into the seed asset
  (same as oxford/big-y assets), exported for use by the migration guard.

### 2. Invented sections (generic grocery layout)

A perimeter-first shopping path, ~21 sections covering the general areas of most
grocery stores. `number` is a stable token used by the matcher (it equals the
`label` here, since there are no aisle numbers); `sort_order` is the default path
the user can reorder later.

| sort_order | number / label |
| --- | --- |
| 0  | Produce |
| 1  | Bakery |
| 2  | Deli |
| 3  | Meat & Seafood |
| 4  | Dairy & Eggs |
| 5  | Breakfast & Cereal |
| 6  | Pasta, Rice & Grains |
| 7  | Canned & Jarred Goods |
| 8  | Condiments & Sauces |
| 9  | Baking & Spices |
| 10 | International Foods |
| 11 | Snacks & Candy |
| 12 | Beverages |
| 13 | Bread |
| 14 | Frozen Foods |
| 15 | Health & Personal Care |
| 16 | Household & Cleaning |
| 17 | Paper & Plastic Goods |
| 18 | Baby |
| 19 | Pet |
| 20 | Other |

Each aisle row: `{ id: <uuid>, store_id: <general id>, number: <label>, label: <label>, sort_order: <n> }`.
"Other" is the catch-all so nothing the matcher can't place is stranded.

### 3. Item→section mapping (`item_locations`)

Author an `item_locations` set mapping every shared catalog item (the ~hundreds
of items sourced from `oxford-62.json` — the single shared `items` catalog) onto
a General Store section, guided by the item's `canonical_name`. This mirrors
`big-y-worcester.json` (which maps the same catalog onto Big Y aisles).

- Generated against the shared catalog item **ids** (so the locations join the
  existing `items`, not new items).
- Fresh UUID per `item_location` row.
- Best-effort draft; the user can re-categorize per ADR-0015's per-store
  override flow. Items left unmapped fall to "Other" / Uncategorized and
  re-classify against this store's candidates on demand.

> Implementation aid: write the mapping as a small keyword→section table over the
> catalog's `canonical_name`s and generate the JSON, rather than hand-typing 200
> rows. Keep the generated JSON in the asset; do not ship the generator.

### 4. Matcher aliases (`general-aliases.json`)

A matcher-only alias file keyed by section `number`, mapping common concrete
query terms to sections (e.g. `"Produce": ["banana","lettuce","apple",...]`,
`"Dairy & Eggs": ["milk","butter","yogurt","eggs",...]`). Mirrors
`big-y-worcester-aliases.json`. Because `buildCandidates` also embeds alias
phrases, this strengthens both the lexical and semantic paths for terms the
catalog mapping doesn't cover.

### 5. Logo fallback (Font Awesome)

`StoreLogo` currently renders `<img src="/store-logos/<slug>.png">` and, on
error, renders **nothing**. The General Store ships no PNG, so it needs a real
fallback.

- Enhance `StoreLogo` so that when the image is missing/errors, it renders a
  circular badge containing a `FontAwesomeIcon` instead of `null`.
- Choose the fallback icon from the slug, symmetric with how the `src` is already
  derived from the slug: a tiny internal map `{ general: faCarrot }` with a
  generic default (e.g. `faBasketShopping`/`faStore`) for any other logoless
  store. This keeps all three call sites (StoreListEntry, StoreHeader,
  StoreDetailRoute) unchanged — they keep passing `slug` + `name`.
- The badge reuses the existing sizing/`rounded-full`/shadow classes so it lines
  up with PNG logos at every `sizeClassName`.

This is the only component change; everything else (settings list, switcher,
detail/reorder, re-aisling) already works generically once the store is seeded.

## Files to change

| File | Change |
| --- | --- |
| `src/assets/aisles/general.json` | **New** seed: `{ store, aisles[21], item_locations[] }` (slug `general`, fresh UUIDs; shared-catalog item ids). |
| `src/assets/aisles/general-aliases.json` | **New** matcher-only aliases keyed by section `number`. |
| `src/services/aisleAliases.ts` | Register `'general': generalAliases` in `ALIASES_BY_SLUG`. |
| `src/db/schema.ts` | Bump `DB_VERSION` 6 → 7 (no shape change). |
| `src/db/idbClient.ts` | Import `general.json`; add it to `buildSeedData()` (fresh installs + `resetUserData`); add append-only `if (oldVersion < 7)` graft for populated installs missing the General Store (mirror v4/v5). |
| `src/components/atoms/StoreLogo.tsx` | Render a Font Awesome icon badge (carrot for `general`, generic default otherwise) instead of `null` on missing/errored image. |
| `src/components/atoms/__tests__/StoreLogo.test.tsx` | Update the "error" test (now shows an icon, not nothing) + add a carrot-for-general case. |

No changes needed to: `SettingsRoute` (maps all stores), `StoreSwitcherSheet`
(lists all stores), `StoreDetailRoute` (generic reorder), `ShoppingListBuilder` /
`AddItemForm` / matcher (already store-parametrized via the active store).

## Migration detail (`if (oldVersion < 7)`)

Append-only, mirroring the Big Y graft pattern already in the file:

- Skip fresh installs (empty `stores`) — they are fully populated by
  `seedDatabase()` afterward.
- For a populated DB missing the General Store id: add the store, its aisles, and
  its `item_locations`. Do **not** touch the active-store preference (oxford
  stays the default current store; the General Store is purely additive).
- Idempotent: guard on `stores.get(GENERAL_STORE_ID) == null`.

Also extend `buildSeedData()` so fresh installs and `resetUserData()` include the
General Store alongside oxford + big-y.

## Implementation checklist

- [x] `general.json` authored (store + 21 sections + shared-catalog item_locations).
- [x] `general-aliases.json` authored, keyed by section `number`.
- [x] `aisleAliases.ts` registers the `general` slug.
- [x] `DB_VERSION` → 7; append-only `oldVersion < 7` graft for existing installs.
- [x] `buildSeedData()` + `resetUserData()` include the General Store.
- [x] `StoreLogo` renders the carrot fallback badge; sizing matches PNG logos.
- [x] `npm run validate` clean.
- [x] `npm run test:e2e` green (41 specs, via session Chromium-build override).

## Tests

### Unit / integration (Vitest + RTL, fake-indexeddb)
- **Seed (fresh install):** after init, `stores` contains the General Store; its
  aisles (21, correct `sort_order`) and `item_locations` are present; oxford
  remains the default `active_store_id`.
- **Migration (populated v6 → v7):** a DB seeded without the General Store gains
  it after upgrade (store + aisles + item_locations), is idempotent on re-open,
  and leaves the active-store preference and user data untouched.
- **`resetUserData`:** restores the General Store along with the others.
- **`aisleAliases`:** `aliasesForSlug('general')` returns the alias map.
- **StoreLogo:** for `slug="general"` renders the carrot icon badge (and on a
  PNG store, an errored image now falls back to the generic icon rather than
  disappearing) — update the existing error test accordingly.
- **(Optional) buildAisleCandidates:** the General Store's items/locations/aliases
  produce candidates resolving a common term (e.g. "milk" → "Dairy & Eggs").

### E2E (Playwright) — extend `e2e/your-stores.spec.ts` (or a new spec)
- The General Store appears under **Your Stores** in Settings with a visible logo
  (icon) and opens its detail screen.
- Its sections render and can be reordered (drag-and-drop persists across reload).
- Switch the active store to the General Store, build/open a list, and confirm
  items bucket into its sections (re-aisling), surviving a reload.

## Validation
1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — General Store flows green.

## Out of scope
- Creating/editing/deleting stores or sections from the UI (store detail stays
  reorder-only, as today).
- A surveyed/real layout — these sections are a generic best-effort draft.
- Changing the default active store (stays Oxford Market Basket #62).
- Per-store default lists.
- A PNG/branded logo for the General Store (intentionally an icon).

## Open items to confirm
1. Icon choice: **carrot** (`faCarrot`) chosen; `faListUl` is the documented
   alternative if the carrot reads poorly at small sizes. Trivial to swap.
2. Section list granularity (21 sections above) — reasonable default; easy to
   add/remove before authoring the `item_locations` mapping.
