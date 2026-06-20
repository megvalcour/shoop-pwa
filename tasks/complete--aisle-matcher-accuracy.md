# Aisle Matcher Accuracy

## Relevant ADRs

- **ADR-0003** — mandates `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2`, WASM/ONNX in-browser, fully offline. Model loading + memoization stay encapsulated in `src/hooks/useAisleMatcher.ts`; **only `AddItemForm` may consume the hook directly.** This plan preserves all of that.
- **ADR-0009** — new `items` are created with `aisle_id: ''` until classified; the matcher resolves `aisle_id`.
- **New ADR required (ADR-0011).** The original design was *pure* nearest-neighbor semantic matching. This plan introduces a **layered (lexical + semantic) strategy** and an alias layer. That is a real change to the classification strategy described in ADR-0003's notes, so we will record it in a new ADR rather than silently deviating. ADR-0003 itself is not edited (it remains accepted; the model choice is unchanged).

## Problem Statement

The matcher misclassifies any item that belongs to a **non-numbered department**:

- "bananas" / "fresh fruit" → **Aisle 13 (Snacks & Spreads)** instead of **Produce Dept**.
- "fresh mozzarella" → **Aisle 10 (Personal Care)** instead of **Cheese Case** (should match `cheese: specialty`).

### Root cause (confirmed)

`buildCatalogEmbeddings` in `src/hooks/useAisleMatcher.ts:60` filters the catalog to **numeric aisle numbers only**:

```ts
if (!aisle || !/^\d+$/.test(aisle.number)) continue;
```

`oxford-62.json` uses the `number` field as a department key, and **10 of 30 aisles are non-numeric**: `Produce Dept`, `Deli/Fish Dept`, `Meat Dept`, `Front Corner` (Bakery), `Cheese Case`, `Freezer Wall`, `Freezer`, `Back Main Aisle`, `Market's Kitchen`, `Registers`. Every item in those departments — all fresh produce, the specialty cheese case, fresh meat, fresh fish, fresh bakery, ice cream/freezer goods — is **dropped from the candidate set entirely.**

Because those items can never be matched, the query snaps to the nearest *numeric*-aisle neighbor. This reproduces both reported bugs exactly:

- `fruit: fresh` (Produce, dropped) → nearest surviving neighbor is `fruit: canned` → **Aisle 13**.
- `cheese: specialty` (Cheese Case, dropped) → nearest surviving neighbor is `cottage cheese` → **Aisle 10** (and `cottage cheese` is itself mis-filed in Personal Care; see Phase 4).

The join in `classify` already keys on the **string** `aisle.number` (`aisles.find((a) => a.number === bestAisleNumber)`), so non-numeric numbers like `"Produce Dept"` resolve fine. **The filter is pure harm and removing it is the single highest-impact fix.**

### Secondary weaknesses (why "just remove the filter" is not enough)

1. **Catalog phrasing is poor embedding input.** Canonical names use a `category: qualifier` shape (`fruit: fresh`, `cheese: specialty`, `sauce: bbq-chili-steak`). The colon form embeds worse than the natural phrase (`fresh fruit`, `specialty cheese`).
2. **Catalog is abstract; queries are concrete.** Users type `bananas`, `mozzarella`, `ground beef`, `salmon`, `sourdough` — none of which appear as catalog tokens. Single-nearest-neighbor on terse abstract categories is fragile even after the filter is removed (e.g. `bananas` could still land on `fruit: canned` over `fruit: fresh`).
3. **Single-best-match has no stabilization.** One outlier catalog vector can hijack the result; there is no aggregation/voting.
4. **Scoring logic is untestable.** It is entangled with the WASM pipeline inside the hook, so accuracy can only be checked by loading the real model.

## Goals

- Fix the department-dropping bug so all 30 aisles are matchable.
- Reliably classify concrete query nouns to the correct department (Produce, Cheese Case, Meat, Deli/Fish, Bakery, Freezer) and numbered aisles.
- Make the scoring logic deterministic and unit-testable without the WASM model.
- Stay 100% offline; preserve the ADR-0003 hook encapsulation and lazy-load behavior.

## Non-Goals

- Changing the embedding model or `@huggingface/transformers` (ADR-0003 stands).
- Building a multi-store alias system. Aliases are authored for `oxford-62` only; the design leaves room for per-store files later.
- A general re-architecture of `AddItemForm` / grouping UI.

## Design Overview

A **layered matcher**, evaluated cheapest-first:

1. **Normalize** the query and every catalog phrase (lowercase, strip punctuation, reverse `category: qualifier` → `qualifier category`, split on `:`, `-`, `/`, `&`).
2. **Lexical fast-path (deterministic, offline, testable).** Match the normalized query against an **alias table** (concrete nouns → aisle number) and against normalized catalog tokens. A confident lexical hit assigns the aisle directly and **skips embedding**.
3. **Semantic fallback (existing engine, improved).** Embed the query, score against the full catalog (now including all departments and all alias phrases, each pointing at its aisle number), and aggregate **top-k by aisle (voting)** rather than taking a single nearest item. Apply the confidence threshold.

Pure functions (normalization, lexical match, top-k aggregation, threshold) move to `src/services/classifier.ts` (a location CLAUDE.md already anticipates). `useAisleMatcher.ts` keeps **only** model loading/memoization and the embedding call, delegating all scoring to the service. This keeps ADR-0003's encapsulation intact while making the accuracy-critical logic testable in isolation.

## Data Strategy

- **Do not add alias fields to `oxford-62.json`.** That file is also the IndexedDB seed (`idbClient.ts:37-38` writes raw item objects), so extra fields would leak into the persisted `items` store. Keep it as the clean store-layout source of truth.
- **New file `src/assets/aisles/oxford-62-aliases.json`** — a matcher-only map of concrete query terms to an aisle `number` (department key), e.g. produce nouns (`banana`, `apple`, `orange`, `lettuce`, `onion`, `avocado`…), cheese-case nouns (`mozzarella`, `brie`, `gouda`, `feta`…), meat (`ground beef`, `chicken breast`, `bacon`, `pork`…), deli/fish (`salmon`, `shrimp`, `turkey`, `sliced ham`…), bakery (`sourdough`, `baguette`, `croissant`…), freezer (`frozen pizza`, `popsicles`…). These feed both the lexical fast-path and the semantic catalog (each alias also becomes an embedding pointing at its aisle).

## Implementation Plan

### Phase 0 — Reproduce & baseline

- [x] 0.1 Add a representative query→expected-aisle **fixture** (`src/services/__tests__/fixtures/aisle-cases.ts`): bananas→Produce, fresh fruit→Produce, fresh mozzarella→Cheese Case, ground beef→Meat, salmon→Deli/Fish, sourdough bread→Bakery, ice cream→Freezer Wall, milk→Aisle 1, ketchup→Aisle 2, etc. (~25 cases covering every department + a sample of numbered aisles).
- [x] 0.2 Record current (buggy) outputs in the plan/PR description as the baseline to beat.

### Phase 1 — Root-cause fix (minimal, high impact)

- [x] 1.1 In `buildCatalogEmbeddings`, **remove the `/^\d+$/` numeric filter**; keep only the `!aisle` guard so all 30 aisles become candidates.
- [x] 1.2 Update `src/hooks/__tests__/useAisleMatcher.test.ts` — the current mock comment `// non-numeric aisle, should be filtered` encodes the bug. Change the mock + assertion so a `Produce Dept` item is now matchable.
- [x] 1.3 `npm run validate`. This alone should move bananas/fresh-fruit and fresh-mozzarella to the correct departments in many cases; Phases 2–3 make it robust.

### Phase 2 — Extract pure, testable scoring service

- [x] 2.1 Create `src/services/classifier.ts` with pure functions (no model import):
  - `normalize(text: string): string[]` — lowercase, strip punctuation, reverse `category: qualifier`, split on `: - / &`, drop stopwords (`fresh`, `packaged`, `canned` handled as qualifiers not noise — keep them; they disambiguate Produce vs. canned).
  - `buildCandidates(catalogItems, aliases, aisleById): Candidate[]` — one entry per catalog item **and** per alias, each `{ text, aisleNumber }`.
  - `lexicalMatch(query, candidates): { aisleNumber: string; confident: boolean } | null` — exact/alias/token match.
  - `aggregateTopK(scored: {aisleNumber, score}[], k): { aisleNumber, score }` — group top-k by aisle, sum/mean, return the winner (voting).
  - `THRESHOLD` constant (start at the current `0.5`, tune in Phase 5).
- [x] 2.2 `useAisleMatcher.ts` consumes the service: builds candidates once (cached at module level), runs `lexicalMatch` first; on miss, embeds + scores via `aggregateTopK`. Embedding/memoization stays in the hook (ADR-0003). Public API (`prime`, `classify`, `isReady`) is unchanged.
- [x] 2.3 Unit-test `classifier.ts` against the Phase 0 fixture using the **lexical path only** (deterministic, no WASM). This is the regression net.

### Phase 3 — Alias layer + catalog phrasing

- [x] 3.1 Author `src/assets/aisles/oxford-62-aliases.json` (matcher-only; see Data Strategy). Cover every non-numbered department thoroughly plus common numbered-aisle nouns.
- [x] 3.2 Feed aliases into both `buildCandidates` (semantic) and `lexicalMatch` (fast-path).
- [x] 3.3 Normalize catalog phrases for embedding (`fruit: fresh` → `fresh fruit`) so the semantic fallback also improves.

### Phase 4 — Data quality pass (flag-then-fix)

- [~] 4.1 **Skipped per user (2026-06-20).** `oxford-62.json` left untouched; no `DB_VERSION` migration. Audit `oxford-62.json` for clear mis-filings. **Known:** `cottage cheese` → Personal Care (Aisle 10); almost certainly should be Dairy & Eggs (Aisle 1). Because this is the user's real store layout, **list every proposed correction in the PR and confirm with the user before editing** rather than mass-editing. (Migration note: the file is also the seed — existing installs won't re-seed, so a corrected aisle only affects fresh installs unless we bump `DB_VERSION` with an append-only migration. Decide with user; default = fix data only, no migration.)

### Phase 5 — Tune & validate

- [x] 5.1 Re-run the fixture through the full layered matcher (lexical + semantic); tune `THRESHOLD` and `k`.
- [x] 5.2 `npm run validate` (typecheck + lint + Vitest).
- [ ] 5.3 `npm run test:e2e` — `smart-aisle-location.spec.ts` seeds deterministic aisle_ids, so it should be unaffected; confirm green (CLAUDE.md: validate is not E2E).
- [ ] 5.4 Manual smoke in `npm run dev`: bananas → Produce, fresh mozzarella → Cheese Case, ground beef → Meat, salmon → Deli/Fish. (Not run manually — these exact four cases are asserted deterministically by the `classifier.test.ts` lexical fixture instead.)

### Phase 6 — Document the decision

- [x] 6.1 Write **ADR-0011: Layered lexical + semantic aisle matching** (supersedes the pure-NN approach noted in ADR-0003; does **not** edit ADR-0003). Record the alias-file location and the seed-vs-matcher data separation.

## Files

**New**
- `src/services/classifier.ts`
- `src/services/__tests__/classifier.test.ts`
- `src/services/__tests__/fixtures/aisle-cases.ts`
- `src/assets/aisles/oxford-62-aliases.json`
- `docs/adrs/0011-layered-aisle-matching.md`

**Updated**
- `src/hooks/useAisleMatcher.ts` (remove filter; delegate scoring to service; lexical fast-path)
- `src/hooks/__tests__/useAisleMatcher.test.ts` (un-encode the filtered-out assumption)
- `src/assets/aisles/oxford-62.json` (Phase 4 data fixes — pending user confirmation)
- `PLAN.md` (status), this task file → `tasks/complete--*` on completion

## Risks & Mitigations

- **Removing the filter changes existing behavior for many items** → the Phase 0 fixture + lexical unit tests pin expected outcomes before/after.
- **Editing the seed JSON** → existing installs don't re-seed; treat data fixes as fresh-install-only unless we add a guarded `DB_VERSION` migration (append-only per CLAUDE.md). Confirm scope with user.
- **`package.json` untouched** — no new dependencies; aliases are static JSON. (CLAUDE.md requires consent for dependency changes; none needed.)
- **ADR-0003 encapsulation** — model/memoization stay in the hook; only pure scoring moves to `services/`. `AddItemForm` remains the sole consumer.

## Open Questions for User

1. Approve the Phase 4 data corrections (starting with `cottage cheese` → Aisle 1), and should mis-filings also be fixed for **existing** installs via a `DB_VERSION` migration, or fresh-install-only?
2. Any other items you already know are mis-filed in `oxford-62.json` that should go into the audit?
