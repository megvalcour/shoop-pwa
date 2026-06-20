# Use Layered Lexical + Semantic Aisle Matching

## Status

Accepted

## The Problem

Pure nearest-neighbour semantic matching mis-classified any item in a
non-numbered department (Produce, Cheese Case, Meat, Deli/Fish, Bakery, Freezer)
and was too fragile for the concrete nouns users actually type ("bananas",
"mozzarella", "ground beef").

## Options Considered

- **Pure semantic nearest-neighbour over the catalog (the original ADR-0003
  approach)** — superseded here: it dropped non-numbered departments and snapped
  concrete queries to the wrong abstract catalog category.
- Hand-written rule/keyword table only — deterministic but brittle and unable to
  generalise to unseen terms.
- **Layered lexical fast-path + improved semantic fallback** (selected).

## Rationale

The single highest-impact fix was removing the `/^\d+$/` numeric-aisle filter in
`buildCatalogEmbeddings`, which had silently excluded 10 of 30 departments from
the candidate set. On top of that, a layered strategy is both more accurate and
more testable:

1. **Normalize** queries and catalog phrases (lowercase, strip punctuation,
   reverse the catalog's `category: qualifier` shape into a natural
   `qualifier category` phrase, split on `:` `-` `/` `&`).
2. **Lexical fast-path** — match the normalized query against an alias table and
   the catalog tokens. A confident hit assigns the aisle directly and skips
   embedding (deterministic, offline, fast).
3. **Semantic fallback** — embed the query and aggregate the top-k neighbours by
   aisle (voting) rather than trusting a single nearest item, then apply a
   confidence threshold.

All scoring logic lives in `src/services/classifier.ts` as pure functions, so
accuracy is unit-testable without loading the WASM model. `useAisleMatcher.ts`
retains only model loading, memoization, and the embedding call, preserving
ADR-0003's encapsulation (model choice unchanged; `AddItemForm` remains the sole
consumer of the hook).

## Notes

- Supersedes the pure nearest-neighbour classification strategy described in the
  Notes of ADR-0003. ADR-0003 itself is unchanged: the model
  (`@huggingface/transformers`, `Xenova/all-MiniLM-L6-v2`, WASM/ONNX, fully
  offline) and its hook encapsulation still stand.
- Aliases live in `src/assets/aisles/oxford-62-aliases.json`, a **matcher-only**
  file. They are deliberately kept out of `oxford-62.json`, which doubles as the
  IndexedDB seed (`idbClient.ts`); adding alias fields there would leak into the
  persisted `items` store. The design leaves room for per-store alias files later.
- Single-token aliases match by containment (e.g. "mozzarella" inside "fresh
  mozzarella"), which can in rare cases over-trigger on compound nouns (e.g.
  "milk chocolate"); the alias list is curated to avoid known collisions and the
  semantic fallback covers the rest.
- Tunables: `THRESHOLD` (0.5, carried over from the original engine) and `TOP_K`
  (5) are exported constants in `classifier.ts`.
- A separate data-quality pass on `oxford-62.json` mis-filings (e.g. cottage
  cheese in Personal Care) is intentionally **not** part of this decision; it is
  gated on user confirmation because the file is the user's real store layout and
  also the seed.
