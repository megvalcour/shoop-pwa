# Big Y Aisle Adjustments

Update the Worcester Big Y store data to a new aisle layout: replace the
numbered aisles (currently 1–18) with a new set of 15 numbered aisles, keep all
non-numbered department aisles as-is, and add a new **Frozen** section. Re-derive
the per-store `item_locations` and matcher aliases against the new layout, and
ship the change to existing installs via an append-only DB migration.

## Decisions (confirmed with user)

1. **Label style — short curated labels.** Numbered aisles keep the existing
   concise style (e.g. `Aisle 1 — Health & Beauty`). The full comma-separated
   category lists from the new layout are used **only as matcher aliases**, not
   as the visible label.
2. **Propagation — versioned migration, reset Big Y.** Bump `DB_VERSION` 4 → 5.
   The migration replaces Big Y's aisles and **all** of its `item_locations`
   wholesale. Any manual aisle picks previously made at Big Y are dropped; those
   items simply re-classify against the new layout. Other stores (Market Basket
   / oxford-62), user items, lists, and the default list are untouched.

## Constraining ADRs

- **ADR-0015 (store-agnostic items + per-store `item_locations`)** — items stay
  store-agnostic; only Big Y `item_locations` and aisles change. ADR-0015
  already records that the Big Y layout is "best-effort drafted ... the user can
  correct later," so resetting its locations is consistent with that caveat.
- **ADR-0011 (layered lexical + semantic matching)** — aliases are matcher-only
  data keyed by aisle `number`. The new category lists feed these aliases. No
  change to the matching strategy or scoring.
- **Migrations are append-only** (CLAUDE.md / ADR-0002) — add a new
  `if (oldVersion < 5)` case; never edit existing cases.

No ADR is contradicted and no new ADR is required: this is a data refresh plus a
routine append-only migration. The "reset Big Y locations" tradeoff is recorded
here rather than in a new ADR because the architecture is unchanged.

## New aisle layout

### Non-numbered department aisles — KEEP UNCHANGED (same ids)

Produce, Floral, Bakery, Natural & Living Well, Deli & Kitchen, Seafood,
Meat & Butcher Shop, Dairy, Pharmacy, Checkout. Their existing UUIDs,
`number`, and `label` stay exactly as they are today.

### New Frozen section — ADD

A new non-numbered department aisle:

- `number: "Frozen Dept"`, `label: "Frozen"`, fresh UUID.
- `sort_order`: placed after numbered aisle 15 and before `Dairy Dept`
  (re-number `sort_order` for all aisles in a single contiguous pass — see
  "Sort order" below).
- This is where the old `Frozen Foods (Aisle A/B)` contents land.

### Numbered aisles 1–15 — REPLACE (fresh UUIDs)

Old numbered aisles 1–18 are removed; the 15 below replace them. Recommended
short labels (implementer may refine); the **alias source** column lists the
full category strings that drive the aisle's matcher aliases.

| # | Recommended label | Alias source (from new layout) |
|---|---|---|
| 1 | Health & Beauty | Cosmetics, First Aid, Facial Care, Bath & Body, Feminine Needs, Shaving Needs, Incontinence, Deodorant |
| 2 | Pharmacy & Hair Care | Cough & Cold, Analgesics, Cough Drops, Vitamins, Diet & Nutritional, Shampoo/Conditioner, Hair Care |
| 3 | Baby & Dental | Stomach Needs, Diapers & Wipes, Dental Care, Toys, Eye Care, Formula, Hosiery, Baby Food |
| 4 | Cards, Party & Juice | Greeting Cards, Bottled Juice, Party Goods, Juice, Gift Bags, Stationery, Wrapping Paper |
| 5 | Cereal, Coffee & Tea | Cereal, Cereal & Granola Bars, Natural Cereal, Cocoa, Hot Cereal, Tea, Coffee |
| 6 | Baking & Cooking | Sugar & Spices, Cake Mix, Foilware, Baking Needs, Desserts, Cooking Oils, Pancakes/Syrup, Cookware |
| 7 | Bread, Crackers & Spreads | Crackers, Bread, Specialty Crackers, Wraps & Pitas, Cookies, Peanut Butter, Specialty Cookies, Jams/Jelly |
| 8 | Water & Household Basics | Light Bulbs, Powdered Drinks, Batteries, Water, Isotonics, Sparkling Water, Can Fruit, Flavored Water |
| 9 | Soda & Beverages | Non-Carbonated Beverages, Energy Drinks, Seltzer, Soda, Non-Alcoholic Mixers, Specialty Soda, Tonic & Club Soda |
| 10 | Snacks & Candy | Seasonal, Snack Chips, Chocolates, Pretzels, Candy, Rice Cakes, Snack Nuts, Popcorn |
| 11 | Pasta & International | Spaghetti Sauce, International Foods, Pasta, Rice, Tomato Paste, Goya, Kosher, Salsa |
| 12 | Canned Goods & Condiments | Canned Vegetables, Salad Dressing, Gravy, Condiments, Stuffing, Prepared Foods, Soup, Vinegar |
| 13 | Pet Care | Cat Litter, Cat Food, Bird Seed, Dog Food, Pet Care, Dog Treats, Premium Pet Food |
| 14 | Laundry & Cleaning | Bleach/Fabric Softener, Laundry Detergent, Mops/Brooms, Dish Soap, Potpourri, Closet Needs, Air Fresheners, Household Cleaners |
| 15 | Paper Goods | Cups/Plates, Paper Towels, Napkins, Bath Tissue, Facial Tissue, Bags/Wraps |

### Sort order

Reassign `sort_order` contiguously (0..N) in physical walk order across all 26
aisles: the existing front departments (Produce → Meat), then numbered 1–15,
then **Frozen**, then Dairy, Pharmacy, Checkout. New total: **26 aisles**
(10 non-numbered + 15 numbered + 1 Frozen), down from 28.

## Implementation steps

### 1. Rewrite `src/assets/aisles/big-y-worcester.json`

- **`store`** — unchanged (same id/slug, so the migration can target it).
- **`aisles`** — keep the 10 non-numbered aisle objects verbatim; replace the
  18 old numbered aisles with the 15 new ones (fresh `crypto.randomUUID()` ids,
  `number` = "1".."15", recommended labels); add the Frozen department aisle.
  Renumber every `sort_order`.
- **`item_locations`** — every shared catalog item currently has one Big Y
  location (182 total). Re-bucket each into its new aisle so the count stays
  182. Use the old→new crosswalk below; the **split** rows require per-item
  review against the new category lists.

#### Old → new aisle crosswalk

Clean 1:1 (re-point every location on the old aisle to the single new aisle):

| Old aisle | New aisle |
|---|---|
| 1 Health & Beauty | 1 |
| 4 Canned Goods & Soups | 12 |
| 5 Pasta & Grains | 11 |
| 6 International Foods | 11 |
| 7 Condiments & Dressings | 12 |
| 8 Bread & Spreads | 7 |
| 13 Water & Bulk Beverages | 8 |
| 14 Frozen Foods (Aisle A) | Frozen |
| 15 Frozen Foods (Aisle B) | Frozen |
| 16 Paper Goods & Plastic | 15 |
| 17 Laundry & Cleaning | 14 |

Splits / merges (review each item by name against the new category lists):

| Old aisle | Re-bucket into |
|---|---|
| 2 Breakfast & Cereal | 5 (cereal/breakfast) — confirm no baking strays |
| 3 Coffee, Tea & Baking | 5 (coffee/tea) **and** 6 (baking) |
| 9 Snacks & Crackers | 7 (crackers) **and** 10 (snacks) |
| 10 Chips & Cookies | 10 (chips) **and** 7 (cookies) |
| 11 Soda & Sparkling Water | 9 (soda) **and** 8 (sparkling/flavored water) |
| 12 Juice & Sports Drinks | 4 (juice) **and** 8/9 (isotonics/energy) |
| 18 Baby & Pet Care | 3 (baby/diapers/formula) **and** 13 (pet) |

Department locations (Produce/Bakery/Deli/Meat/Dairy/etc.) keep pointing at the
same unchanged department aisle ids — no remap needed.

> Generation tip: write a one-off node script in `scratchpad/` that loads the
> current JSON, applies the crosswalk, and for split aisles matches each item's
> `name`/`canonical_name` against the new alias term lists (reuse the
> normalization in `classifier.ts`) to choose the target aisle. Hand-verify the
> split-aisle assignments before committing. Keep location `id`s stable where an
> item's aisle is unchanged so reset/migration diffs stay small.

### 2. Rewrite `src/assets/aisles/big-y-worcester-aliases.json`

- Re-key numbered entries to "1".."15", each populated from that aisle's full
  category list — split compound terms (`Shampoo/Conditioner` →
  `shampoo`, `conditioner`; `Bags/Wraps` → `bags`, `wraps`), lowercase, and add
  obvious concrete query terms (e.g. aisle 5: `cereal`, `granola bars`,
  `oatmeal`, `coffee`, `tea`, `cocoa`).
- Add a `"Frozen Dept"` entry (carry over the old `"14"` frozen aliases:
  `frozen pizza`, `ice cream`, `frozen vegetables`, `frozen waffles`, etc.).
- Keep the existing department alias entries (`Dairy Dept`, `Produce Dept`,
  `Deli Dept`, `Meat Dept`, `Bakery Dept`) unchanged.
- Drop the obsolete numeric keys that no longer exist (old `"14"`).

### 3. Add the v5 migration — `src/db/schema.ts` + `src/db/idbClient.ts`

- `schema.ts`: bump `DB_VERSION` to `5`.
- `idbClient.ts`: add `if (oldVersion < 5) { ... }` to `upgrade()` (append-only;
  do not touch existing cases). For a **populated** DB that already has the Big Y
  store:
  - Delete every Big Y aisle (`aisles` rows where `store_id === bigYSeed.store.id`).
  - Delete every Big Y `item_location` (via the `store_id` index).
  - Add the new aisles from `bigYSeed.aisles` and the new locations from
    `bigYSeed.item_locations`.
  - Skip on a fresh install (empty `stores`): `seedDatabase()` handles it, same
    guard pattern as the existing v4 case. If the store is absent entirely
    (older install that never grafted Big Y), graft it fresh.
- `buildSeedData()` and `resetUserData()` need no logic changes — they already
  read the JSON assets, so they pick up the new layout automatically.

### 4. Update tests

- `src/db/__tests__/idbClient.test.ts`:
  - Big Y aisle count `28` → `26` (graft test, line ~189).
  - Per-store Big Y `item_locations` stays `182`; total stays `364` — confirm.
  - Add a test for the v5 migration: seed a v4-shaped DB with the **old** Big Y
    aisles + a manual Big Y override location, run the upgrade, assert aisles are
    replaced (26, new labels present) and the override is gone (reset).
- Check and update any fixtures/assertions that hardcode Big Y aisle labels or
  counts: `src/services/__tests__/fixtures/aisle-cases.ts`,
  `src/hooks/__tests__/useStores.test.ts`,
  `src/components/molecules/__tests__/StoreSwitcherSheet.test.tsx`,
  `AisleCard.test.tsx`, `SortableAisleCard.test.tsx`. Most use inline fixtures,
  not the real asset — verify before editing.
- `e2e/smart-aisle-location.spec.ts`: confirm it targets oxford-62 (grep shows
  no Big Y reference); update only if it asserts Big Y aisle names.

### 5. Validate

- `npm run validate` (typecheck + lint + Vitest).
- `npm run test:e2e` if any UI/aisle assertions were touched.
- Manual smoke (`npm run dev`): switch active store to Big Y, confirm the new
  aisle list renders, a few known items bucket into sensible aisles, and frozen
  items land in the new Frozen section.

## Acceptance criteria

- Big Y shows 15 numbered aisles with the new labels, all non-numbered
  departments unchanged, plus a Frozen section. (26 aisles total.)
- Every Big Y catalog item has exactly one `item_location` pointing at a valid
  new aisle; spot-checked items land in sensible aisles.
- Aliases file keys match the new aisle `number`s and Frozen dept.
- Existing installs upgrade cleanly via the v5 migration (Big Y replaced, other
  stores/user data intact); fresh installs seed the new layout directly.
- `npm run validate` passes; E2E green.

## Out of scope

- Changing the Market Basket / oxford-62 layout.
- Re-architecting the matcher or item model.
- Preserving prior manual Big Y aisle overrides (intentionally reset).
