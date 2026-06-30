# Add four dedicated IndexedDB stores for the Eat tab, referencing the existing item catalog

## Status

Accepted

## The Problem

The Eat tab needs to persist recipes, their per-ingredient quantities, a weekly meal plan, and fetched nutrition data, but today imported ingredients are dumped into a shopping list and not stored as a reusable, queryable unit.

## The Solution

Four new IndexedDB object stores — `recipes`, `recipe_ingredients`, `meal_plan_entries`, `nutrition_cache` — added in one append-only `if (oldVersion < 9)` migration case, with `recipe_ingredients` referencing the existing `items` catalog by id.

## Options Considered

- **Dedicated Eat stores that reference `items.id` for catalog reuse** — selected.
- Extend the existing `items` / `list_items` stores with recipe and nutrition fields — rejected: conflates shopping-list rows with recipe authorship and weekly planning, and overloads the on-demand shopping-list model (ADR-0009) with concerns it was never shaped for.
- A single denormalized `recipes` blob store (ingredients nested inside each recipe document) — rejected: no per-ingredient query surface for the enrichment pipeline (Phase 4) or the per-recipe/per-day nutrition rollup (Phase 5), and it duplicates ingredient→food matches across recipes instead of sharing them.

## Rationale

The Eat feature introduces three genuinely new relations — a recipe, a recipe's ingredient line, and a planned meal — none of which map onto the existing shopping stores without distorting them. Keeping them in dedicated stores preserves the separation the existing model already draws between the catalog (`items`), per-store placement (`item_locations`, ADR-0015), and lists (`shopping_lists` / `list_items`).

Three deliberate reuse decisions keep the new stores from forking the data model:

1. **`recipe_ingredients.item_id` references the existing `items` catalog** so a recipe ingredient and a shopping-list line for the same food share one canonical item (and its aisle classification), rather than introducing a parallel food vocabulary.
2. **`nutrition_cache` is keyed by FDC id**, not by ingredient text, so the same food fetched for two different recipes is cached once. The query→FDC-id mapping is cached alongside it so a re-opened planned recipe resolves to its food offline.
3. **`recipe_ingredients` carries the extracted `quantity` + `unit`** — the numeric value `normalizeIngredient` deliberately discards today (ADR-0021). Capturing it is the structural prerequisite for nutrition math; the extraction itself is additive Phase 3 work and does not change the ADR-0021 noun-phrase behavior.

The migration is **non-breaking and additive** (confirmed with the user, 2026-06-30): it creates four empty stores and alters or drops nothing, so every existing device upgrades cleanly with no data loss.

## Notes

**Designed store shapes** (interfaces land in `src/db/schema.ts` *in Phase 3/4*, not in Phase 0). All ids are `crypto.randomUUID()` strings per the project convention; `nutrition_cache` is the one store keyed by an external id (the FDC id).

```
recipes
  id            string (PK, uuid)
  title         string
  source_url    string | undefined        // present when imported from a URL
  servings      number                    // recipe yield; per-serving math divides by this
  created_at    string (ISO) | number

recipe_ingredients
  id            string (PK, uuid)
  recipe_id     string (Index → recipes.id)
  raw           string                    // original ingredient line, preserved for display
  canonical_name string                   // from normalizeIngredient, lower-cased for matching
  item_id       string | undefined        // Index → items.id when matched to the catalog
  quantity      number                    // extracted value (new in Phase 3; discarded today)
  unit          string                    // extracted unit token
  grams         number | undefined        // resolved by the Phase 4 enrichment pipeline
  fdc_id        string | undefined        // resolved FDC food, → nutrition_cache key

meal_plan_entries
  id            string (PK, uuid)
  recipe_id     string (Index → recipes.id)
  day           string                    // day-of-week or ISO date (grid-vs-rolling: see ADR-0028 sibling / Phase 5)
  planned_servings number

nutrition_cache
  fdc_id        string (PK, external)     // USDA FoodData Central food id
  payload       object                    // per-100g nutrient panel + foodPortions
  query         string                    // the normalized ingredient query that resolved here
  fetched_at    number                    // epoch ms, for future staleness policy
```

**Indexes:** `recipe_ingredients` on `recipe_id` (and `item_id` for catalog cross-reference); `meal_plan_entries` on `recipe_id`. These follow the existing `ShoopDB` index style in `schema.ts`.

**Migration mechanics (Phase 3/4, not Phase 0):**
- Append a new `if (oldVersion < 9)` case to `upgrade()` in `src/db/idbClient.ts`; never rewrite existing cases (migrations are append-only).
- Bump `DB_VERSION` 8 → 9 in `src/db/schema.ts`.
- The bump MUST ship as a `feat:` (or `feat(db):`) commit per ADR-0017; CI fails a `DB_VERSION` change with no `feat:` in the range.
- Classification: **non-breaking / additive** — recorded here per the AGENTS.md requirement to confirm breaking-ness before a migration commits.

**Relationship to existing stores:** `recipe_ingredients.item_id` is a soft reference into `items`; a recipe ingredient need not have a catalog item yet (it can be matched lazily). `item_locations` (per-store aisle, ADR-0015) is untouched — Eat does not place recipe ingredients in aisles.

**Open questions deferred to later phases (not blocking this ADR):** where the user sets "servings I'm eating" (per-serving vs whole-recipe — Phase 3/5); fixed Mon–Sun grid vs rolling 7 days for `meal_plan_entries.day` (Phase 5); DRI micro-nutrient coverage breadth (Phase 2/5).
