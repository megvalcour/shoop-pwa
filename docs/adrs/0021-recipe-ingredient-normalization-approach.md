# Drop quantity/unit parsing from recipe import; produce a clean name only and let the user set units in the preview

## Status

Proposed

## The Problem

Hand-maintained regex stripping of imported recipe ingredients keeps mis-parsing
real-world formatting (e.g. the dual-measure `"2 cups/70 grams chocolate chips"`),
and each targeted fix only covers the one variant it was written for.

## The Solution

Stop extracting quantity and unit from ingredient strings entirely: normalize each
line to a clean sentence-cased name (descriptors lifted to parentheticals, raw line
shown beneath as today), default quantity to ×1 like any manual item add, and let
the user optionally set a unit in the import preview before committing.

## Context

Recipe import (ADR-0019) fetches a page server-side, extracts schema.org
`recipeIngredient` strings, and hands them to the client. `src/utils/normalizeIngredient.ts`
turns each raw string (`"2 cups all-purpose flour, sifted"`) into an addable row
(`{ name: "All-purpose flour", quantity: 2, unit: "cup" }`). The importer
(`RecipeImporter.tsx`) shows the parsed name (with the raw line beneath as a
mistranslation guard) in a read-only checklist; the user can only check/uncheck,
not edit.

The parser is a sequence of anchored regex strips run in order: list-marker glyphs
→ parentheticals → trailing prep clause → leading quantity → article → size
descriptor → unit → slash-delimited alternate measure → connective "of". It is
deliberately conservative (falls back to the raw string rather than emit a wrong
noun), pure, network-free, and adds no dependency.

**Why the two prior fixes failed.** Both attacked one surface variant of the same
underlying problem — a dual US+metric measure — without generalizing:

- `a147478` added size/quantity/unit lifting but did not consider dual measures.
- `dc7ade0` added `stripAlternateMeasures`, but anchored it to a **leading,
  space-padded** slash (`^/\s*`). It fixes `"1 cup / 180 grams flour"` and leaves
  `"2 cups/70 grams chocolate chips"` broken: with no space, the tokenizer sees
  `cups/70` as the first token, the unit strip fails to match it, the slash strip
  (which only fires on a leading `/`) never runs, and the name becomes
  `"Cups/70 grams chocolate chips"`. Verified against the current code:

  ```
  "2 cups/70 grams chocolate chips" → name: "Cups/70 grams chocolate chips"  ✗
  "100g/3.5oz dark chocolate"       → name: "G/3.5oz dark chocolate"          ✗
  "1 cup / 180 grams flour"         → name: "Flour"                           ✓
  ```

The pattern is structural: each fix encodes one site's exact punctuation, and the
next site's variant (no space, leading metric, em-dash, `or` instead of `/`,
trailing conversion) is a fresh edge case. This is unbounded whack-a-mole.

## Options Considered

1. **Keep patching the hand-rolled regex pipeline (status quo).** Add another
   strip for the no-space slash, then the next variant, and so on. Zero deps,
   fully offline, deterministic. Rejected as the primary path: this is exactly
   what failed twice. The strip order is order-dependent and the anchors are
   brittle, so each addition risks regressing a previously-handled case, and the
   long tail of recipe punctuation is effectively unbounded.

2. **Tokenize-once deterministic parser (in-house rewrite).** Split the string
   into tokens a single time and walk them with one state machine: leading
   quantity(s) and ranges, optional unit, an explicit "alternate measure"
   branch triggered by a `/` or `or` boundary regardless of surrounding
   whitespace, then the noun phrase. Splitting on the slash *structurally*
   (before unit lookup) collapses the spaced/unspaced variants into one code
   path and kills the whole dual-measure class, not one instance of it. Still
   pure, offline, deterministic, no dependency; more code than a regex patch but
   bounded and unit-testable.

3. **Adopt a maintained ingredient-parser library** (e.g. `parse-ingredient`,
   `recipe-ingredient-parser-v3`). A shared, externally-maintained grammar that
   already handles ranges, fractions, unit tables, and many dual-measure forms.
   Trade-offs: adds a runtime dependency (CLAUDE.md requires sign-off on
   `package.json` changes) and bundle weight; it is still rule-based, so exotic
   phrasings can still mis-split — we would inherit *someone else's* edge cases
   instead of owning ours, and lose the conservative raw-string fallback unless
   we wrap it.

4. **AI extraction via `@huggingface/transformers` (already in-stack, ADR-0003).**
   The in-browser model is `all-MiniLM-L6-v2`, an *embedding* model for sentence
   similarity (aisle matching). Pulling `{quantity, unit, name}` out of a string
   is token-classification (NER) or seq2seq generation — a task MiniLM cannot
   perform. It would require a *different* model: a fine-tuned ingredient NER
   model or a small instruct LLM running in WASM, i.e. hundreds of MB of extra
   download, slow cold start, and non-deterministic output, to solve a problem
   that is fundamentally lexical, not semantic. Rejected: wrong tool, severe
   weight/latency cost, and non-determinism in a path the user expects to be
   instant. (Embeddings already do the *downstream* job — aisle placement — well;
   that is not what is broken here.)

5. **Parse server-side in the import function (ADR-0019).** Run a Node ingredient
   parser inside the existing Cloudflare Function and return structured fields.
   npm parsers run more comfortably in Node than in the client bundle, and
   logic could ship without an app release. Rejected as the sole fix: it only
   helps the URL-import path, does nothing for any future manual-paste entry,
   pushes parsing off the client (weakening the offline-first posture for a
   feature that should degrade gracefully), and widens the deliberately-bounded
   "stateless JSON-LD extraction" scope of ADR-0019.

6. **Editable import-preview rows (UI control).** Let the user edit the parsed
   name, quantity, and unit inline in `RecipeImporter` before committing. Does
   not improve parsing at all, but caps the downside: a mis-parse becomes a quick
   correction instead of a polluted catalog row. The importer already renders the
   raw line beneath the parsed name, so the user always has the source-of-truth in
   view. Low risk, fully offline, no dependency. Weak as a *sole* fix (every
   import would need hand-cleanup), strong as a backstop.

7. **Drop quantity/unit extraction entirely; clean name only, units set by the
   user.** Stop trying to *capture* a quantity and unit from the string at all.
   Keep the name-cleaning passes (strip the leading measure run, lift size
   descriptors to parentheticals, sentence-case), but treat the leading measures
   as noise to discard rather than data to preserve — so there is no "which
   measure do we keep" decision to get wrong. Imported items land at the default
   quantity ×1, exactly like a manually-added item, and the import preview offers
   an optional unit control per row (and the raw line stays beneath). No parse of
   quantity from the entry. Fully offline, no dependency, and *less* code than
   today (deletes the carry-through plumbing and the brittle
   `stripAlternateMeasures`).

**Selected: Option 7** — drop quantity/unit extraction; produce a clean name only
and let the user set units in the preview.

## Rationale

The decisive realization is that **the entire long tail of measure punctuation —
including the dual-measure bug — lives exclusively in the quantity/unit
*extraction* path.** The prior fixes were hard because they had to preserve the
*first* measure as a field while discarding the alternate; that "keep one, drop the
rest" decision is what `stripAlternateMeasures` got wrong on the no-space variant.
Remove the requirement to capture any measure and the bug class evaporates: there
is no measure to mis-assign.

- **It deletes the problem instead of out-parsing it.** Name cleaning still removes
  the leading measure run, but greedily — it discards `2 cups/70 grams`,
  `1 cup / 180 grams`, `100g/3.5oz`, `1 to 2 large`, and any other leading
  number/unit/slash run wholesale, because nothing downstream depends on which
  token was the "real" amount. This is strictly simpler and more robust than any
  parser that has to reconstruct the amount.

- **Recipe amounts are the wrong unit for a grocery list anyway.** A recipe says
  "2 cups flour"; you buy flour by the bag. Carrying recipe quantities into a
  shopping list is low value and often misleading, so defaulting every imported
  item to ×1 — identical to how every other item is added — is not a regression,
  it is the correct grocery-list semantics. The user adjusts the few items where a
  count matters, with the raw recipe line right there for reference.

- **It fits a single-user, offline-first PWA.** The user is present at import time;
  an optional per-row unit control is a light touch on the handful of items that
  warrant it, and it reuses the same unit vocabulary the app already uses for
  manual adds. No AI, no dependency, smaller surface area than the status quo.

- **The richer options are rejected as overbuilt for the goal.** A tokenize-once
  parser (Option 2) or a library (Option 3) still does the expensive thing —
  faithfully reconstructing an amount we have now decided we do not want to store.
  AI extraction (Option 4) is doubly wrong: the in-stack model does semantic
  similarity, not field extraction, and we would be adding a heavy, non-
  deterministic model to compute a number we intend to throw away. The embedding
  model keeps the job it is good at — aisle placement of the resulting item
  (ADR-0011/0015).

## Notes

- Scope guard for implementation: greedily stripping the leading measure run must
  still stop at the noun (never empty the name — keep the existing conservative
  raw-string fallback), and must not consume a leading word that is part of the
  name itself. The `NormalizedIngredient.quantity`/`unit` fields can be dropped, or
  retained as always-undefined, depending on call-site churn.
- `RecipeImporter.tsx` gains an optional per-row unit control and stops passing a
  parsed quantity into `commit()`; `addListItem`/`addDefaultItem` already default
  the quantity, so the call simplifies to `{ name, unit? }`. No persistence/DB
  change, no `DB_VERSION` bump.
- Keep `normalizeIngredient` pure and exhaustively unit-tested; the existing test
  file is the regression harness. Add the failing cases above as fixtures asserting
  the cleaned *name* only (no quantity/unit assertions), so the dual-measure forms
  can never silently regress.
- This record supersedes nothing; it constrains future work on
  `normalizeIngredient` and the import preview, and complements ADR-0019 (import
  proxy) and ADR-0003 (embedding model is for matching, not extraction).
