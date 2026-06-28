# Active Task — Normalize recipe imports: drop quantity/unit extraction (ADR-0021)

## Goal

Implement the decision recorded in **ADR-0021** (currently `Proposed`): stop
extracting a quantity and unit from imported recipe ingredient strings entirely.
`normalizeIngredient` keeps producing a clean, sentence-cased **name** (descriptors
lifted to parentheticals, raw line preserved for display) but treats the entire
leading measure run — including the dual-measure forms that the regex pipeline keeps
mis-parsing — as noise to discard rather than data to capture. Imported items land at
the default quantity ×1, exactly like a manually-added item, and the import preview
offers an **optional per-row unit control** before committing.

This deletes the bug class instead of out-parsing it: with no measure to preserve,
there is no "keep one, drop the rest" decision for `stripAlternateMeasures` to get
wrong on the no-space variant.

## ADRs that constrain this work

- **ADR-0021** (this task implements it). Flip its `Status` from `Proposed` to
  `Accepted` as part of the change — it is the only permitted edit to the body once
  accepted, and ADRs are immutable thereafter.
- **ADR-0019** (serverless fetch proxy for recipe import) — unchanged. We do **not**
  move parsing server-side; the import function keeps returning raw
  `recipeIngredient` strings.
- **ADR-0003** (HuggingFace embeddings for *matching*, not extraction) — unchanged.
  The embedding model keeps doing aisle placement on the resulting item
  (ADR-0011/0015); it is not used to parse ingredients.

## Current behavior (what we are replacing)

- `src/utils/normalizeIngredient.ts` returns
  `{ name, quantity?, unit?, raw }`. It strips a leading quantity, lifts a size
  descriptor, strips a leading unit, then runs `stripAlternateMeasures` (anchored on a
  **leading, space-padded** `/`) to discard a US+metric alternate.
- Known-broken (verified against current code, per ADR-0021):
  - `"2 cups/70 grams chocolate chips"` → name `"Cups/70 grams chocolate chips"` ✗
  - `"100g/3.5oz dark chocolate"` → name `"G/3.5oz dark chocolate"` ✗
  - `"1 cup / 180 grams flour"` → name `"Flour"` ✓ (only the spaced variant works)
- `RecipeImporter.tsx` shows each row's parsed quantity as a `"2 · Flour"` prefix and
  passes `{ name, quantity, unit }` into `addListItem`/`addDefaultItem`.
- The two add hooks accept an optional `quantity` and carry it through (dedupe path
  does `existing.quantity + (quantity ?? 1)`). **RecipeImporter is the only caller
  that passes `quantity`** — `AddItemForm` and `DefaultListEditor` add path call the
  hooks name-only (confirmed by grep; the `quantity` they reference is the *update*
  path via `QuantitySheet`, not the add path).

## Design decisions

1. **`normalizeIngredient` returns `{ name, raw }` only.** Drop the `quantity` and
   `unit` fields from `NormalizedIngredient`. (ADR-0021 Notes permit retaining them as
   always-`undefined`, but since we own every call site, removing them is cleaner and
   forces the compiler to find each carry-through site.)

2. **Greedily discard the leading measure run; never capture a value.** We no longer
   compute the decimal value of any number — we only need to *match and consume* the
   leading number/unit/slash run. This lets us delete `parseNumberToken`, `round3`,
   and collapse `VULGAR_FRACTIONS` from a value map to a character class. Keep the
   `UNITS` set (still needed to recognize a unit token to strip) and the `LEADING_QUANTITY`
   matcher (recognize-and-strip only).

3. **Kill the dual-measure class structurally, before unit lookup.** Normalize the
   measure region once so the spaced/unspaced/glued variants collapse into one code
   path:
   - Insert spaces around a `/` separator (`cups/70` → `cups / 70`).
   - Split a number glued to a following unit letter (`100g` → `100 g`,
     `3.5oz` → `3.5 oz`).
   Then a single greedy loop consumes `[quantity] [unit]` repeatedly across `/` (and
   `or`) boundaries until neither matches, discarding all of it. Because the slash is
   split *structurally* before the unit lookup, `"2 cups/70 grams chocolate chips"`
   and `"1 cup / 180 grams flour"` and `"100g/3.5oz dark chocolate"` all flow through
   the same path → bare noun.

4. **Preserve the conservative guarantees that already pass tests.** Still:
   - strip leading list-marker glyphs, parentheticals, and the trailing prep clause;
   - lift a single leading size descriptor into a trailing parenthetical
     (`"3 medium tomatoes"` → `"Tomatoes (medium)"`), before the unit strip so
     `"1 large can of tomatoes"` → `"Tomatoes (large)"`;
   - drop a leading article (`a`/`an`) and the connective `of`;
   - **never empty the name** — fall back to the sentence-cased raw string;
   - never split a digit-letter token that is not part of a measure run down to an
     empty name (the empty-name fallback covers the degenerate case).

5. **Per-row unit control in the preview (optional, free-text).** Match the app's
   existing manual-add unit UX, which is **free-text** (`QuantitySheet` uses a plain
   `Input` for unit). Each preview row gets a compact optional unit `Input`, backed by
   a `<datalist>` of the common `UNITS` for suggestions but not restricted to them.
   Default empty → omitted on commit (hook defaults unit to `''`).

6. **`commit()` passes `{ name, unit? }`, no quantity.** The add hooks already default
   `quantity ?? 1` and `unit ?? ''`, so the offline/optimistic path is unchanged. We
   additionally **remove the now-dead `quantity` field** from `AddListItemInput` and
   `AddDefaultListItemInput` and change the dedupe bump from `+ (quantity ?? 1)` to
   `+ 1` — ADR-0021's "delete the carry-through plumbing." No other caller passes
   `quantity` (verified).

7. **No persistence/DB change. No `DB_VERSION` bump.** `list_items`/`default_list`
   rows are unchanged on disk (they always had `quantity`/`unit` columns; we just stop
   sourcing `quantity` from the import). This is a `feat`, not a migration.

## File-by-file changes

### `src/utils/normalizeIngredient.ts`
- Change `NormalizedIngredient` to `{ name: string; raw: string }`.
- Add a measure-region normalization helper: space out `/` separators and split
  `number↔unit-letter` glue. Apply it to the working string after the parenthetical /
  prep-clause stripping and whitespace collapse.
- Replace the quantity+unit+`stripAlternateMeasures` sequence with one greedy
  `stripLeadingMeasures` loop: consume `[quantity] [unit]` repeatedly across `/`/`or`
  boundaries, discarding values; bail without consuming if it would empty the name.
- Keep `stripLeadingSize` (size→parenthetical) running before the measure strip so the
  `"large can of tomatoes"` case still resolves. Keep article strip and `of` strip.
- Delete now-unused `parseNumberToken`, `round3`, and the numeric *values* in
  `VULGAR_FRACTIONS` (keep the glyphs as a `FRAC` character class for matching).
- Keep the empty-name → sentence-cased raw fallback and the `sentenceCase` /
  descriptor-append at the end.

### `src/utils/__tests__/normalizeIngredient.test.ts`
- Drop all `quantity`/`unit` assertions; assert the cleaned **name** (and `raw`) only.
- Keep every existing name expectation (they remain correct: `"All-purpose flour"`,
  `"Tomatoes (medium)"`, `"Eggs (large)"`, `"Eggs (extra-large)"`, fallbacks, etc.).
- **Add regression fixtures** for the dual-measure forms, asserting name only:
  - `"2 cups/70 grams chocolate chips"` → `"Chocolate chips"`
  - `"100g/3.5oz dark chocolate"` → `"Dark chocolate"`
  - `"1 cup / 180 grams flour"` → `"Flour"`
  - `"180 grams / 1 cup flour"` → `"Flour"`
  - `"1 stick / 113 g butter"` → `"Butter"`
  - an `or`-delimited variant, e.g. `"1 cup or 240 ml milk"` → `"Milk"`

### `src/components/molecules/SelectionList.tsx`
- The whole row is a `<button>`; an `<input>` cannot be nested inside it (invalid HTML
  + click would toggle selection). Add an **optional** `renderAccessory?: (item, index)
  => React.ReactNode` rendered as a *sibling* of the toggle button inside the `<li>`
  (flex row), so the accessory sits outside the toggle target. When omitted, the
  component renders exactly as today (no churn for existing callers — `DefaultList`,
  etc.).

### `src/components/organisms/RecipeImporter.tsx`
- `normalized` items are now `{ name, raw }`. Remove the `"{quantity} · "` prefix in
  `renderLabel`; show `name` with the `raw` line beneath when it differs (unchanged
  guard).
- Add per-row unit state aligned to `normalized` (reset alongside `checked` in the
  existing `useEffect`). Render the unit `Input` via the new `renderAccessory` slot,
  with a shared `<datalist>` of common units. `stopPropagation` is not needed since the
  accessory is outside the toggle button.
- `commit()` builds `{ name, unit: rowUnit || undefined }` (and `{ name, unit }` for
  the default target); stop passing `quantity`.

### `src/hooks/useListItems.ts` and `src/hooks/useDefaultList.ts`
- Remove `quantity?` from `AddListItemInput` / `AddDefaultListItemInput` and the
  internal `addListItem(...)` signature; change the dedupe bump to `existing.quantity
  + 1`. Leave `unit?` (still set via the preview control). The `Update*` inputs and
  `QuantitySheet` editing path are untouched.

### `src/components/organisms/__tests__/RecipeImporter.test.tsx`
- Update label expectations: `"2 · Flour"` → `"Flour"`, `"1 · Salt"` → `"Salt"`.
- Update commit payload expectations to `{ listId, name, unit }` / `{ name, unit }`
  with **no `quantity`** key. Default unit (control untouched) commits as `undefined`.
- Add a focused case: setting a row's unit control commits that `unit` for the row.

### `e2e/recipe-import.spec.ts`
- Update the header comment describing normalization (no quantity capture).
- Replace `REVIEW_LABELS` (the `"2 · …"` prefixed strings) with bare cleaned names.
- Remove the `×3` assertion (imported eggs now land at the default ×1). Optionally add
  a step that sets a unit on one preview row and asserts it shows on the committed
  list item.
- `LIST_NAMES` (`"All-purpose flour"`, `"Baking soda"`, `"Eggs (large)"`) are unchanged
  and remain the source-of-truth assertions.

### `docs/adrs/0021-recipe-ingredient-normalization-approach.md`
- Flip `Status: Proposed` → `Status: Accepted` (only permitted edit).

### `PLAN.md`
- Move the ADR-0021 line out of "Current Status" once implemented; record the shipped
  change. Set/clear the Active Task per the workflow on completion.

## Out of scope / non-goals

- No ingredient-parser library, no AI/NER extraction, no server-side parsing (ADR-0021
  Options 3–5, rejected).
- No change to aisle classification, dedupe-by-canonical-name, or the import proxy
  (ADR-0019).
- No `DB_VERSION` bump and no migration — on-disk shape is unchanged.

## Risks & mitigations

- **Digit↔letter glue split could touch a non-measure token** (e.g. a name like
  `"7Up"`). Mitigation: the split only affects the leading measure-strip region and the
  empty-name fallback guarantees we never return an empty/garbage name; add a fixture
  proving a name-leading alphanumeric that is *not* a measure survives, and keep the
  conservative raw-string fallback. If risk is judged too broad, scope the glue-split
  to only fire when the digit run is immediately followed by a known unit token.
- **SelectionList accessory regression** for existing callers. Mitigation: the prop is
  optional and rendering is unchanged when it is absent; no existing call sites pass it.
- **E2E browser mismatch in web sessions** (known backlog issue) can mask a green local
  run. Mitigation: run `npm run test:e2e` with the documented local Chromium override
  and confirm the recipe-import spec passes before calling it done — `validate` does
  **not** cover E2E.

## Validation

1. `npm run validate` (typecheck + lint + Vitest) — green.
2. `npm run test:e2e` (recipe-import spec at minimum) — green, including the updated
   labels and the dropped `×3` assertion.
3. Manual/spec confirmation that the three previously-broken dual-measure strings now
   import as bare nouns.

## Commit plan (Conventional Commits)

- `feat: drop quantity/unit extraction from recipe import (ADR-0021)` covering the
  `normalizeIngredient` rewrite, hook/plumbing cleanup, preview unit control, and test
  updates. (DB version is **not** bumped, so no `feat`-migration constraint applies;
  the `feat` type is correct for a user-facing behavior change.)
- `docs: accept ADR-0021` for the status flip (may be folded into the feat commit).
