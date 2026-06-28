# Pair a tokenize-once deterministic ingredient parser with a user-editable import preview

## Status

Proposed

## The Problem

Hand-maintained regex stripping of imported recipe ingredients keeps mis-parsing
real-world formatting (e.g. the dual-measure `"2 cups/70 grams chocolate chips"`),
and each targeted fix only covers the one variant it was written for.

## The Solution

Replace the incrementally-patched regex pipeline in `normalizeIngredient` with a
single structural tokenize-once parser, and make the import preview rows editable
so any residual mis-parse is a one-tap correction rather than a bad catalog row.

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

**Selected: Option 2 + Option 6** — the tokenize-once parser as the primary fix,
with editable preview rows as the correctness backstop.

## Rationale

The decisive factor is that this is a **single-user, offline-first PWA** where the
user is present at import time and the raw line is already on screen. That reframes
the goal: we do not need a parser that is *always* right (an impossible bar against
the long tail of recipe punctuation) — we need one that is *usually* right and a UI
where the rare miss costs one tap.

- **Option 2 kills the bug class, not the bug.** Splitting on the measure
  separator structurally — before unit lookup, whitespace-independent — handles
  `cups/70`, `cup / 180`, `100g/3.5oz`, and `… or …` in one branch, ending the
  per-variant patching that defeated the last two attempts. It preserves every
  property that made the current approach attractive (pure, offline,
  deterministic, dependency-free, conservative raw fallback).

- **Option 6 makes parsing quality a UX nicety instead of a correctness
  requirement.** With editable rows, even a future un-handled format is a visible,
  one-tap fix rather than a silent bad row — so we are no longer one weird recipe
  away from the next bug report. This is the safety net the previous two
  regex-only fixes lacked.

- **AI (Option 4) is rejected on fit, not ambition.** The in-stack model is for
  semantic similarity; ingredient field-extraction is a lexical/structural task.
  Solving it with a generative or NER model means a heavy second model,
  non-determinism, and latency, to do worse than a small parser on a deterministic
  problem. The existing embedding model continues to own the part it is good at —
  aisle placement of the resulting item (ADR-0011/0015).

- **A library (Option 3) stays the fallback if Option 2 proves insufficient.** If
  the in-house tokenizer accrues its own long tail, adopting a maintained parser
  is the next step — but it needs `package.json` sign-off and a wrapper to keep
  the conservative raw fallback, so it is not the opening move.

## Notes

- Scope guard for implementation: the structural measure-split must not shatter
  ascii fractions (`1/2 cup`) — those are a *quantity*, consumed before the
  measure-separator branch, exactly as today.
- Editable rows are additive to `RecipeImporter.tsx`; the parsed `{name, quantity,
  unit}` simply becomes editable local state before `commit()` rather than being
  read straight from `normalized`. No persistence/DB change, no `DB_VERSION` bump.
- Keep `normalizeIngredient` pure and exhaustively unit-tested; the existing test
  file is the regression harness. Add the failing cases above as fixtures so they
  can never silently regress.
- This record supersedes nothing; it constrains future work on
  `normalizeIngredient` and the import preview, and complements ADR-0019 (import
  proxy) and ADR-0003 (embedding model is for matching, not extraction).
