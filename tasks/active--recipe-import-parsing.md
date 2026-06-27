---
status: active
class: lightweight
e2e_required: true
supersedes_backlog: Recipe Import Quantities (tasks/backlog--recipe-import-quantities.md)
---

# Recipe Import — Cleaner Ingredient Parsing

## Goal

Make imported recipe ingredients land as tidy catalog items instead of verbatim
recipe prose. An entry like **`3 medium tomatoes`** should import as a row named
**`Tomatoes (medium)`** with a **quantity of 3**, and the original line should
stay visible underneath as small, subtle help text so the user can catch any
mistranslation before committing.

Three transforms, plus carrying the parsed amount through to the saved row:

1. **Casing correction** — sentence-case the cleaned name.
2. **Amount extraction** — the parsed quantity/unit (already computed by
   `normalizeIngredient`) is carried into the added row instead of being
   discarded (this absorbs the **Recipe Import Quantities** backlog item).
3. **Descriptions → parentheticals** — a leading *size* descriptor is moved out
   of the noun phrase into a trailing `(…)`.

### Locked decisions (from kickoff Q&A)

| Question | Decision |
| --- | --- |
| Singularize plural nouns? | **No** — keep the noun as written. |
| Which descriptors move to a parenthetical? | **Size only** — `small, medium, large, extra-large, jumbo, baby`. |
| Casing style | **Sentence case** — capitalize the first letter; leave the rest as written (preserves proper nouns like *Parmesan*). |
| Merge quantity on a duplicate add | **Add parsed amount** — `existing.quantity + (parsed ?? 1)`. |

> **Worked example, exactly as it will behave:** `3 medium tomatoes`
> → quantity `3`, no unit, name `Tomatoes (medium)`. Because we deliberately
> **do not singularize**, the result is `Tomatoes`, not `Tomato`. This is a
> conscious trade-off (singularization is error-prone for irregular/uncountable
> nouns); flag in review if the singular form is later wanted.

## ADRs consulted

- **ADR-0019 (serverless fetch proxy for recipe import)** — unchanged. This task
  touches only client-side normalization and the add hooks; the function and its
  contract are untouched.
- **ADR-0015 (store-agnostic items)** — upheld. Imported ingredients remain
  store-agnostic `items` + `list_items`/`default_list`; per-store aisle
  classification still fires through the existing hooks.
- **Item Quantities + Duplicate-Add Increment** (`tasks/complete--item-quantities-dedup.md`)
  — the dedup/increment path is the seam we extend for "add parsed amount".
- No ADR governs string normalization, so no new ADR is required.

## No DB schema change

`DB_VERSION` stays **8**. `quantity` and `unit` already exist on `ListItem` and
`DefaultListEntry`; we are only populating them at add-time. No migration, no
`feat`-level DB bump.

---

## Step 1 — Extend `normalizeIngredient` (pure)

File: `src/utils/normalizeIngredient.ts` (+ `__tests__`).

Current pipeline already: strips list-marker glyphs, drops parentheticals and
trailing prep clauses, parses a leading quantity (ints, decimals, vulgar/ascii
fractions, ranges), strips a leading known unit, drops `of`, and falls back to
the raw string when it can't isolate a noun. **Keep all of that.** Add two
stages **after** the unit strip and **before** the empty-name fallback:

### 1a. Size-descriptor extraction → parenthetical

- Add a `SIZE_DESCRIPTORS` set: `small`, `medium`, `large`, `jumbo`, `baby`,
  plus the two-token / hyphenated `extra large` / `extra-large` (and reasonable
  variants: `xl`? keep out for v1 — too ambiguous).
- After the unit is stripped, inspect the **leading** token(s) of the remaining
  noun phrase. If it is a size descriptor **and** removing it still leaves a
  non-empty noun, lift it out: remainder becomes the name, and the descriptor
  (lower-cased) is appended as ` (descriptor)`.
  - `medium tomatoes` → name `tomatoes`, descriptor `medium` → `tomatoes (medium)`.
  - `extra-large eggs` / `extra large eggs` → `eggs (extra-large)`.
- **Only the leading position**, only **one** descriptor run. Do not scan
  mid-phrase (avoids mangling names where the word is integral). Guard exactly
  like the unit strip: never reduce the name to empty (`large` alone stays).
- The parenthetical is built from our own token, so it is always lower-cased
  regardless of source casing.

### 1b. Sentence-case the name

- Uppercase the first alphabetic character of the final name; **leave the rest
  untouched** so proper nouns survive (`grated Parmesan cheese` →
  `Grated Parmesan cheese`).
- Applies to the cleaned name *and* the raw-string fallback (idempotent there).
- The appended `(descriptor)` stays lower-cased, e.g. `Tomatoes (medium)`.

### Output shape

Keep the existing `NormalizedIngredient` interface (`name`, `quantity?`,
`unit?`, `raw`). The descriptor is **baked into `name`**, not a separate field —
that is what gets stored and displayed, and it keeps the importer/commit path
unchanged in shape. `raw` is still the untouched original.

> **Dedup note:** `resolveItem` lowercases the whole name for `canonical_name`,
> so casing never breaks dedup (`Tomatoes` ↔ `tomatoes` still merge). The
> parenthetical *does* become part of the canonical name, so `Tomatoes (medium)`
> and `Tomatoes` are distinct catalog items. Acceptable for v1; note in the PR.

### Tests (Step 1)

Extend `src/utils/__tests__/normalizeIngredient.test.ts`. **Existing assertions
that expect lower-case names must be updated to sentence case** (e.g.
`all-purpose flour` → `All-purpose flour`). Add cases:
- `3 medium tomatoes` → name `Tomatoes (medium)`, qty `3`, unit `undefined`.
- `2 large eggs, beaten` → `Eggs (large)`, qty `2` (supersedes the current
  "keeps size descriptors" test, which asserted `large eggs`).
- `extra-large` and `extra large` two-token form.
- size descriptor with a unit present: `1 large can of tomatoes` (decide &
  document: `large` is the leading noun token after the unit → `Tomatoes (large)`).
- a bare descriptor that must not empty out (`large`).
- proper-noun preservation (`grated Parmesan cheese` → `Grated Parmesan cheese`).
- fallback line still sentence-cased and never crashes (`, to taste`).

## Step 2 — Carry quantity/unit through the add mutations

This is the **Recipe Import Quantities** backlog item, folded in.

### 2a. `useAddListItem` (`src/hooks/useListItems.ts`)

- Extend `AddListItemInput` with optional `quantity?: number; unit?: string`.
  `AddItemForm` (manual add) passes neither → behavior unchanged.
- New row: seed `quantity: input.quantity ?? 1`, `unit: input.unit ?? ''`.
- Duplicate row (existing dedup-increment branch): **add the parsed amount** —
  `quantity: existing.quantity + (input.quantity ?? 1)`. (Manual re-add with no
  parsed qty keeps the current `+1`.)
- **Unit on a duplicate:** if `existing.unit === ''` and an incoming unit is
  present, adopt the incoming unit; otherwise keep `existing.unit` (never clobber
  a set unit, even on mismatch). Summing across mismatched units is nonsensical
  but bounded — document as a known limitation, do not over-engineer.
- Keep the in-flight de-dupe key and the read/write transaction split exactly.

### 2b. `useAddDefaultListItem` (`src/hooks/useDefaultList.ts`)

- **Signature change:** `mutationFn` currently takes a bare `string`. Change to
  `{ name: string; quantity?: number; unit?: string }` for parity with
  `useAddListItem`. Apply the same new-row seeding and duplicate "add parsed
  amount" + unit rules as 2a (spread still preserves `notes`).
- **Ripple:** update the one production caller, `DefaultListEditor.tsx`
  (`addItem.mutate(name)` → `addItem.mutate({ name })`), and the hook/organism
  tests that call `add.mutateAsync('Olive Oil')` → `{ name: 'Olive Oil' }`.

### Tests (Step 2)

- `useListItems.test.ts` / `useDefaultList.test.ts`: new-row seeds parsed
  qty/unit; duplicate add **sums** parsed qty; manual add (no qty) still `+1`;
  unit adopt-when-empty vs keep-on-mismatch.

## Step 3 — Wire the parsed amount + raw help text in the importer

File: `src/components/organisms/RecipeImporter.tsx`.

- In `commit()`, pass the parsed amount to both targets:
  - list/new: `addListItem.mutateAsync({ listId, name: i.name, quantity: i.quantity, unit: i.unit })`
  - default: `addDefaultItem.mutateAsync({ name: i.name, quantity: i.quantity, unit: i.unit })`
- **Raw line as subtle help text** (already partially present): the checklist
  label already renders `ingredient.raw` on a secondary line when
  `raw !== name`. Keep this; with sentence-casing + parentheticals the names now
  almost always differ from `raw`, so the original shows for nearly every row —
  which is exactly the "guard against mistranslation" affordance. Confirm styling
  is small/subtle (`text-text-muted text-xs`) and consider surfacing the parsed
  amount in the primary label, e.g. `3 · Tomatoes (medium)`, so the user sees the
  quantity that will be saved.
- **Out of scope for v1:** inline editing of the parsed qty/unit before commit.
  Quantities remain editable post-commit via the existing `QuantitySheet` on the
  list/default-list screens.

### Tests (Step 3)

- `RecipeImporter.test.tsx`: assert commit forwards `{ quantity, unit }` to the
  mocked hooks; assert the raw help line renders for a transformed row.

## Step 4 — E2E

`e2e/recipe-import.spec.ts` (extend existing): with the mocked
`/api/import-recipe` returning `["3 medium tomatoes", ...]`, assert the review
screen shows `Tomatoes (medium)` with the raw line beneath, commit to a new
list, and verify the list row shows quantity `3`. (Per CLAUDE.md, `validate`
won't catch route/UI regressions — E2E is required to call this done.)

## Step 5 — Validate & ship

- `npm run validate` (typecheck + lint + unit).
- `npm run test:e2e`.
- Commit (conventional: `feat: …` for the user-visible parsing improvement; the
  hook signature change is internal). **No `DB_VERSION` bump**, so no migration
  gate is triggered.
- Push to `claude/recipe-import-parsing-4smtqw`.
- On completion: in `PLAN.md` clear the Active Task and **remove the "Recipe
  Import Quantities" backlog entry** (absorbed here); rename this file to
  `tasks/complete--recipe-import-parsing.md` and likewise retire
  `tasks/backlog--recipe-import-quantities.md`.

## Risks / open questions

- **No singularization** means `Tomatoes (medium)`, not the literal
  `Tomato (medium)` from the prompt. Locked by decision; revisit only if the
  singular form is explicitly wanted (needs an irregular/uncountable exception
  list to be safe).
- **`baby` as a size descriptor** turns `baby spinach` → `Spinach (baby)` and
  `baby carrots` → `Carrots (baby)`. Defensible (it *is* a size), but it changes
  established product names — call out in the PR; easy to drop `baby` from the
  set if undesired.
- **Mismatched-unit duplicate sum** (`2 cups` + `3 cloves`) yields a numerically
  summed qty under the existing unit. Bounded and rare; documented, not solved.
- **Descriptor/unit ordering edge cases** (e.g. `large can of …`) are decided in
  Step 1 tests; keep extraction strictly leading-position to stay conservative.
