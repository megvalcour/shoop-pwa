# Backlog: Carry Recipe-Parsed Quantity & Unit into Added Items

Follow-up to **Item Quantities + Duplicate-Add Increment**
(`tasks/complete--item-quantities-dedup.md`).

`normalizeIngredient` (`src/lib/normalizeIngredient.ts`) already parses an
ingredient's `quantity`/`unit` (e.g. "2 cups flour" → qty 2, unit "cups"), but
`RecipeImporter` (`src/components/organisms/RecipeImporter.tsx`) currently passes
**only `ingredient.name`** to the add mutations, discarding both.

## Goal

Wire the parsed `quantity`/`unit` through so an imported ingredient lands with
its real amount instead of the default qty 1 / no unit.

## Open design questions

- Extend `useAddListItem` / `useAddDefaultListItem` to accept an optional
  `{ quantity, unit }`. New rows would seed these instead of the qty-1/`unit:''`
  defaults.
- **Merge semantics on a duplicate add** (the dedup-increment path already in
  place): does a parsed quantity *set*, *add to*, or *ignore* the existing
  row's quantity? And what happens on a **unit mismatch** (existing "cups" vs.
  incoming "lbs")?
- Whether the importer should surface/let the user adjust the parsed values
  before commit.

The dedup-increment behaviour from the completed task already applies to recipe
import for free; this task is purely about preserving the parsed amount.
