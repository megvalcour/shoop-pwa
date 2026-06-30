---
epic: eat-tab
phase: 4
status: active
class: standard
e2e_required: true
clarifications: |
  Phase 4 of the "Eat" tab epic (`tasks/backlog--eat-tab.md`). This is the
  NUTRITION ENRICHMENT PIPELINE phase: turn a persisted recipe's ingredient lines
  (raw text + canonical name + quantity + unit, all captured in Phase 3) into real
  per-ingredient nutrient data, then roll that up to per-serving and whole-recipe
  nutrition. It is the first Eat phase to add a SECOND server-side surface — the
  `/api/nutrition` Cloudflare Pages Function (ADR-0027) — and the first to write to
  the `nutrition_cache` store (created empty in Phase 3's v9 migration).

  No weekly meal plan, no scoring-against-targets visualization — those stay
  Phase 5. Phase 4 stops at: a recipe's ingredients are matched to FDC foods,
  converted to grams, and summed into a nutrient panel displayed on the recipe
  detail screen. The `meal_plan_entries` store stays untouched.

  Decisions to lock with the user before implementation (see "Open questions to
  confirm before coding" — do not start until these are answered):
  - NO SCHEMA BUMP: Phase 4 writes to the existing `nutrition_cache` +
    `recipe_ingredients` stores created/typed at v9. `DB_VERSION` stays 9 (the
    `NutritionCacheEntry.payload` is typed `unknown` precisely so Phase 4 can fix
    its shape without a migration). This is therefore NOT a `feat:`-gated DB
    commit. Confirm no migration is wanted.
  - NEW DEPENDENCY ON A SERVER ENV SECRET: `/api/nutrition` needs `FDC_API_KEY`
    bound in the Cloudflare Pages project + a `VITE_NUTRITION_TOKEN` /
    `NUTRITION_TOKEN` shared-token pair (mirrors ADR-0019's `IMPORT_TOKEN`). Only
    empty placeholders go in `.env.example`. No `package.json` dependency is
    expected (reuses the already-bundled embedding model + hand-written parsers).
  - ENRICH TRIGGER: enrich lazily on first open of a recipe detail (recommended),
    not eagerly on save. Cheaper against the FDC rate limit and keeps the save
    path offline-capable. Confirm lazy-on-view vs eager-on-save.
  - EMBEDDING RERANK: ship the embedding-rerank of FDC candidates (ADR-0027
    Spike 1) behind the same model-loader the aisle matcher uses, with a
    manual-pick fallback for low-confidence matches. If the live Spike-1 numbers
    were never produced (egress was blocked in Phase 0), default to plain top-hit
    + manual pick and treat rerank as an internal refinement — the manual-pick
    fallback makes correctness independent of rerank quality. Confirm.
---

# Phase 4: "Eat" Tab — Nutrition Enrichment Pipeline

## Relevant ADRs

- **ADR-0027** (Eat nutrition data source, *Accepted*) — THE governing ADR for
  this phase. Mandates: a single stateless first-party `/api/nutrition` Cloudflare
  Pages Function holding `FDC_API_KEY` server-side; a one-host allowlist
  (`api.nal.usda.gov`) — NOT an open proxy like `/api/import-recipe`; `https`-only,
  redirects off, ~2 MB size cap, ~8 s timeout; a shared `X-Shoop-Nutrition` token
  from a build-time `VITE_NUTRITION_TOKEN`; the FDC-response→internal-shape mapping
  isolated in a pure `functions/_lib/parseFdcFood.ts` (unit-testable, no `fetch`);
  every food cached in `nutrition_cache` keyed by FDC id; explicit
  "needs connection to enrich" offline degradation. Spike 1 (FDC match quality)
  governs whether embedding-rerank ships; Spike 2 (quantity→grams) governs the
  conversion strategy. Do not deviate without a superseding ADR.
- **ADR-0026** (Eat data model, *Accepted*) — defines the stores Phase 4 finally
  exercises. `nutrition_cache` is keyed by FDC id so the same food fetched for two
  recipes caches once; the query→FDC-id mapping is cached alongside (the entry's
  `query` field). `recipe_ingredients.fdc_id` + `.grams` + `.item_id` are the
  fields Phase 4 fills (left undefined by Phase 3). No store shape changes; the
  payload type is the only thing Phase 4 pins down (`payload: unknown` → a real
  interface — a type-level change, not a schema/migration change).
- **ADR-0019** (serverless fetch proxy for recipe import, *in force*) — the
  precedent `/api/nutrition` mirrors and must justify itself against ("future
  functions must each justify themselves against this record"). Reuse its exact
  patterns: minimal Pages Function typings (no `@cloudflare/workers-types`), the
  token-first short-circuit, `AbortController` timeout, capped body read, the
  CORS-for-localhost helper, the typed JSON error contract. The KEY DIFFERENCE
  ADR-0027 calls out: nutrition talks to ONE fixed host, so there is no
  user-controlled SSRF surface — the URL is built server-side from the FDC base +
  the query, never from user input as a destination.
- **ADR-0003** (HuggingFace transformers for semantic matching) +
  **ADR-0013** (web-worker aisle inference) — Phase 4 reuses the already-loaded
  `Xenova/all-MiniLM-L6-v2` model to rerank FDC candidates. Follow the
  `useAisleMatcher` / `aisleMatcher.worker.ts` model-loader pattern (lazy boot,
  module-singleton worker, off-main-thread embedding). Decide: extend the existing
  worker with a `rerank` message, or add a small sibling worker. Recommend a
  separate, focused embedding entry point reused by both (the aisle worker is
  store/candidate-coupled; reranking FDC hits is a different candidate set) — but
  share the model load so there is NO second model download (the whole point of the
  reuse).
- **ADR-0011** (layered aisle matching) — the lexical→semantic layering precedent.
  The FDC matcher mirrors the *shape* (cheap deterministic step, then semantic
  rerank, then a confidence floor → manual fallback), with all pure scoring in a
  testable module (like `services/classifier.ts`).
- **ADR-0004** (Zustand + TanStack Query split) — nutrition data is PERSISTENT
  (cached in IndexedDB), so all reads/writes go through TanStack Query hooks
  (`hooks/useNutrition.ts` / extend `useRecipes.ts`). The in-flight enrichment
  status of a recipe (loading/partial/offline-miss) is ephemeral and may live in
  component state or a tiny Zustand slice — NOT in IndexedDB.
- **ADR-0005** (atomic design) — the nutrient panel is a molecule/organism reading
  a hook; the per-100g number formatting is pure util. Reuse existing atoms
  (`Button`, `Spinner`, `Badge`) and the `BottomSheet`/`SelectionList` molecules
  for the manual-pick food chooser before authoring new ones.
- **ADR-0028** (section-scoped green theme) — every Phase 4 surface renders under
  `/eat`, inheriting the green sub-theme. Role tokens only; no hardcoded hexes.
- **ADR-0021** (recipe ingredient normalization) — unchanged. Phase 4 consumes
  `canonical_name` (already produced) as the FDC search query; it does not touch
  `normalizeIngredient`. The quantity/unit it converts to grams come from the
  Phase 3 `parseIngredientMeasure` output already stored on each ingredient row.
- **ADR-0001/0002** (single-repo / IndexedDB offline-first) — the offline
  critical path (shopping check-off) is untouched. Enrichment is the ONE thing
  that needs the network and it degrades gracefully: a cached food scores offline;
  a never-seen ingredient surfaces "needs connection to enrich."

## Goal

Make a saved recipe's nutrition real. For each `recipe_ingredient`: search USDA
FoodData Central (through the new `/api/nutrition` proxy) for its `canonical_name`,
pick the best-matching food (embedding rerank + manual-pick fallback), convert the
ingredient's stored quantity+unit to grams, scale the food's per-100 g nutrient
panel, and cache the food in `nutrition_cache`. Sum the enriched ingredients into a
per-serving and whole-recipe nutrient rollup (energy + the three macros + the same
curated micro panel the Phase 2 targets use), and display it on the recipe detail
screen. Already-enriched recipes work fully offline; unenriched ingredients show a
clear "connect to enrich" state. No weekly plan, no target scoring (Phase 5).

## Exit Criteria

- **`/api/nutrition` function:** `functions/api/nutrition.ts` — a stateless proxy
  to `api.nal.usda.gov` FDC search + detail, holding `FDC_API_KEY` server-side,
  gated by the `X-Shoop-Nutrition` shared token, with `https`-only single-host
  allowlist, `AbortController` timeout, capped body read, redirects off, and the
  ADR-0019 typed-JSON error contract (`not_configured` / `unauthorized` /
  `invalid_query` / `fetch_failed` / `no_match`). Two operations (search by query;
  detail by FDC id) — either as one endpoint with a mode param or two routes;
  pick one and document it. No user-supplied destination URL ever reaches `fetch`.
- **Pure FDC parser:** `functions/_lib/parseFdcFood.ts` — maps an FDC food JSON to
  the internal nutrient shape (per-100 g energy + macros + the curated micros, plus
  `foodPortions` for count/container gram resolution). Pure, no `fetch`,
  unit-tested against captured FDC fixtures (mirrors `parseRecipeJsonLd.ts`).
- **Quantity+unit → grams:** `src/utils/toGrams.ts` (pure) — implements the Spike-2
  conversion ladder: (1) static mass table (`g/kg/oz/lb` + plurals); (2) a small
  curated density table for common volume×ingredient pairs (flour, sugar, milk,
  oil, water…) → volume→ml→g; (3) FDC `foodPortions` lookup for count/container
  units (clove, can, slice, stick…); (4) `undefined` (→ manual gram entry) for
  anything unresolved. Pinch/dash → a fixed nominal or manual. Fully unit-tested.
- **Client enrichment hook(s):** `src/hooks/useNutrition.ts` — for a recipe,
  resolves each ingredient: cache hit (`nutrition_cache` by `fdc_id`, or by the
  cached `query`→fdc_id mapping) short-circuits the network; a miss calls
  `/api/nutrition`, reranks candidates with the embedding model, writes the chosen
  food to `nutrition_cache`, and persists the resolved `fdc_id`/`grams` back onto
  the `recipe_ingredient`. Offline + cache-miss → an explicit unenriched state, not
  an error. TanStack Query keys/caching defined here only (ADR-0004).
- **Embedding rerank:** reuses the bundled `all-MiniLM-L6-v2` (no new download) via
  the `useAisleMatcher` worker-loader pattern to score FDC candidate descriptions
  against the ingredient phrase; below a confidence floor → manual-pick fallback.
  If Spike-1 live numbers are absent, plain top-hit + manual pick is the shipped
  default and rerank is an internal refinement (correctness rides on manual pick).
- **Manual-pick fallback UI:** a food chooser (BottomSheet + SelectionList) listing
  FDC candidates for an ingredient the matcher is unsure about; picking one
  persists the `fdc_id` and re-rolls the rollup. Reuses existing molecules.
- **Per-recipe rollup:** a pure `src/services/nutritionRollup.ts` summing enriched
  ingredients into whole-recipe + per-serving (÷ `recipe.servings`) totals for
  energy, protein, fat, carbs, and the curated micros — keyed to MATCH the
  `nutritionTargets` micro keys (fiber/sodium/calcium/iron/potassium/vitaminC/
  vitaminD) so Phase 5 can score rollup-vs-target with no key reconciliation. Pure,
  unit-tested, tolerant of partially-enriched recipes (sums what it has, flags the
  rest).
- **Recipe detail display:** the `RecipeDetailRoute` gains a nutrition section —
  per-serving panel (energy + macros + micros), a whole-recipe toggle, per-row
  enrichment status (enriched / matched-to "X" with a re-pick affordance /
  needs-connection), and an "Enrich" action when lazy. Green theme, role tokens.
- **Offline degradation:** with no network, cached foods render full nutrition;
  uncached ingredients show "needs connection to enrich" and the rollup shows a
  partial/estimated state. No throw, no blocked render. Verified offline.
- **Tests:** unit tests for `parseFdcFood`, `toGrams` (every Spike-2 bucket +
  unresolved fallback), `nutritionRollup` (full, partial, per-serving math), the
  function's request guards (token, single-host, error mapping — mirror
  `import-recipe.test.ts`), and `useNutrition` against fake-indexeddb + a mocked
  `/api/nutrition` (cache hit short-circuits; miss fetches+caches; offline-miss →
  unenriched). `npm run validate` clean.
- **E2E:** import/save a recipe → open detail → enrich (mocked `/api/nutrition`) →
  see the per-serving panel; reload → nutrition persists offline (no network);
  low-confidence ingredient → manual pick → rollup updates. Reuse the existing
  IndexedDB-reset/import helpers. `npm run test:e2e` green (`e2e_required: true`).
- **Commit:** NOT a schema commit (no `DB_VERSION` bump). Conventional Commits —
  `feat: enrich Eat recipes with USDA nutrition data` (a user-facing feature, so
  `feat:`, but no migration gate). **No `package.json` change** expected; if a dep
  seems needed, ASK first (AGENTS.md). `.env.example` gains empty
  `VITE_NUTRITION_TOKEN=` / `FDC_API_KEY=` placeholders only.

---

## Nutrient payload shape (pins down `NutritionCacheEntry.payload`)

`src/db/schema.ts` — replace `payload: unknown` with a real interface (a
type-level change; the v9 store already exists, so NO `DB_VERSION` bump). Mirror
exactly the nutrients the rollup and Phase 2 targets need, so the two align:

```ts
export interface FdcNutrientPanel {
  fdc_id: string;
  description: string;          // FDC food description (shown in the manual picker)
  per100g: {
    energyKcal: number;
    protein: number;            // g
    fat: number;                // g
    carbs: number;              // g
    fiber: number;              // g
    sodium: number;             // mg
    calcium: number;            // mg
    iron: number;               // mg
    potassium: number;          // mg
    vitaminC: number;           // mg
    vitaminD: number;           // mcg
  };
  foodPortions?: Array<{ unit: string; gramWeight: number; amount: number }>;
}
```

`NutritionCacheEntry.payload: FdcNutrientPanel` (was `unknown`). The keys under
`per100g` are deliberately the SAME identifiers the `nutritionTargets` micro panel
uses (`fiber`, `sodium`, …) so the Phase 5 rollup-vs-target join is a key match,
not a mapping table. Surface for review: confirm this is a pure type refinement of
an existing store (no migration) and not a schema change requiring `feat(db)`.

## The `/api/nutrition` function (ADR-0027, mirrors ADR-0019)

`functions/api/nutrition.ts` + `functions/_lib/parseFdcFood.ts`.

- **Two operations** (recommend one endpoint, `?op=search|detail`):
  - `search` — `?q=<normalized noun phrase>` → FDC `/foods/search` (dataType
    constrained, page-size small) → return a trimmed candidate list
    `[{ fdcId, description, dataType }]` for the client to rerank. Parsing of the
    full nutrient panel is NOT done here (search results are noisy/partial).
  - `detail` — `?fdcId=<id>` → FDC `/food/{id}` → run `parseFdcFood` →
    return one `FdcNutrientPanel`. This is the payload cached client-side.
- **Security (ADR-0027):** single-host allowlist (`api.nal.usda.gov` only); URL
  built server-side from a constant base + sanitized query/id — NO user URL ever
  reaches `fetch` (this is the key SSRF difference from `import-recipe`); `https`
  only; `redirect: 'manual'` (reject any 3xx); `MAX_RESPONSE_BYTES` ~2 MB;
  `AbortController` ~8 s; token-first short-circuit (`X-Shoop-Nutrition` ===
  `env.NUTRITION_TOKEN`, else `not_configured`/`unauthorized`); `FDC_API_KEY` read
  from env and attached server-side, never returned. Reuse the `import-recipe.ts`
  CORS-localhost + `json()` helpers (lift shared helpers into a `_lib` module if it
  reads cleaner — but don't over-abstract; a small duplication is fine).
- **Error contract:** `not_configured` (401, no key/token bound) / `unauthorized`
  (401) / `invalid_query` (400) / `no_match` (422, FDC returned nothing) /
  `fetch_failed` (502). Typed, mirrors `import-recipe`.
- **`parseFdcFood.ts`:** pure. FDC `food.foodNutrients[]` carries nutrient ids /
  names + amounts (per 100 g for SR/Foundation/Branded). Map the curated nutrient
  ids → `per100g`; pass through `food.foodPortions[]` (modifier+gramWeight) for the
  count/container gram path. Unit-tested against 2–3 captured FDC fixtures
  (Foundation, SR Legacy, Branded — different nutrient-id encodings).

## Quantity → grams (`src/utils/toGrams.ts`, Spike-2 ladder)

Pure. Input: `{ quantity: number; unit: string; canonical_name: string;
foodPortions?: … }` → `{ grams: number; source: 'mass'|'density'|'portion'|
'nominal' } | { grams: undefined; reason: 'unresolved' }`.

1. **Mass** (~15% of vocab): static factor table — `g:1, kg:1000, oz:28.35,
   lb:453.59` (+ plurals/aliases from `measureTokens.UNITS`). Deterministic.
2. **Volume** (~41%): unit→ml static table (`cup:236.6, tbsp:14.8, tsp:4.93,
   ml:1, l:1000, …`) then ml→g via a SMALL curated density table keyed by a coarse
   match on `canonical_name` (flour ~0.53, sugar ~0.85, milk ~1.03, oil ~0.92,
   water 1.0, default ~1.0 with a "approx" flag). Document the densities' source.
3. **Count / container** (~44%): look up the unit in the food's FDC `foodPortions`
   (e.g. "1 clove", "1 can") → its `gramWeight`; fall back to a tiny manual
   per-piece table for the most common (clove, slice, stick); else unresolved.
4. **Unresolved** → `grams: undefined` → the row prompts a manual gram entry
   (the `recipe_ingredients.grams` escape hatch ADR-0026 reserved). `pinch`/`dash`
   → a fixed nominal (~0.3 g / 0.6 g) or manual.

`empty unit` (a bare count like "2 eggs") → portion path on `foodPortions` if
present, else nominal/manual. Every branch unit-tested; the unresolved path is the
load-bearing correctness guarantee (never silently invent grams).

## Client enrichment flow (`src/hooks/useNutrition.ts`)

Per recipe ingredient, in order, all offline-safe until the network step:

1. **Already resolved?** `recipe_ingredient.fdc_id` set + a `nutrition_cache` hit
   → use it (fully offline). Recompute grams if missing.
2. **Query cached?** `nutrition_cache` carries the `query` (canonical_name) that
   resolved a food before → reuse that `fdc_id` (offline). Persist it onto the row.
3. **Network search** (online only): `/api/nutrition?op=search&q=<canonical_name>`
   → candidate list → **embedding rerank** (worker, shared model) → top candidate
   above the confidence floor: `/api/nutrition?op=detail&fdcId=…` → `parseFdcFood`
   panel → write `nutrition_cache` (keyed by fdc_id, with `query` + `fetched_at`) →
   persist `fdc_id` + computed `grams` onto the `recipe_ingredient`.
4. **Low confidence** → mark the row "needs review," surface the manual-pick UI
   (candidate descriptions); user's pick runs step-3's detail+cache+persist.
5. **Offline + uncached** → mark "needs connection to enrich"; rollup treats the
   row as missing (not zero), shows partial state.

Persisting `fdc_id`/`grams` back to `recipe_ingredients` makes a recipe permanently
offline-capable after one enrichment. Writes go through a `useRecipes`-style
mutation; invalidate the recipe + nutrition queries.

## Rollup (`src/services/nutritionRollup.ts`, pure)

Input: ingredients with `{ grams?, panel? (FdcNutrientPanel) }` + `servings`.
Output: `{ whole: NutrientTotals; perServing: NutrientTotals; enrichedCount;
totalCount; unresolved: string[] }`. `NutrientTotals` keys === the targets' keys
(energy + 3 macros + 7 micros) so Phase 5 scores by key match. Each ingredient
contributes `panel.per100g[k] * grams / 100`. Missing grams or panel → skip + list
in `unresolved`. Per-serving = whole ÷ `servings`. No rounding (UI rounds at the
edge, as `nutritionTargets` does). Fully unit-tested incl. the partial case.

## Implementation Steps

### Part 1 — Server: `/api/nutrition` + FDC parser
- [ ] `functions/_lib/parseFdcFood.ts` (pure) + its `__tests__` with captured FDC
  fixtures (Foundation / SR Legacy / Branded).
- [ ] `functions/api/nutrition.ts` — search + detail ops, ADR-0027 guards, typed
  error contract, single-host allowlist, token-first short-circuit. Mirror
  `import-recipe.ts` structure (CORS-localhost, `json()`, `AbortController`,
  capped read). `Env`: `FDC_API_KEY?`, `NUTRITION_TOKEN?`.
- [ ] `functions/api/__tests__/nutrition.test.ts` — token missing/mismatch, bad
  query, single-host enforcement, FDC-error mapping, happy-path shape. Mirror the
  existing `import-recipe.test.ts`.

### Part 2 — Type refinement + env wiring (NO migration)
- [ ] `src/db/schema.ts` — `FdcNutrientPanel` interface; `NutritionCacheEntry.payload`
  `unknown` → `FdcNutrientPanel`. `DB_VERSION` UNCHANGED (stays 9). Add a code
  comment noting Phase 4 fills `recipe_ingredients.fdc_id`/`grams`.
- [ ] `.env.example` — append empty `FDC_API_KEY=` + `VITE_NUTRITION_TOKEN=` with
  the same explanatory comment style as `VITE_IMPORT_TOKEN`.
- [ ] `src/vite-env.d.ts` — declare `readonly VITE_NUTRITION_TOKEN?: string`.

### Part 3 — Pure client utils/services
- [ ] `src/utils/toGrams.ts` (+ `__tests__`) — the Spike-2 conversion ladder.
- [ ] `src/services/nutritionRollup.ts` (+ `__tests__`) — the summation engine,
  keyed to the `nutritionTargets` nutrient keys.
- [ ] (If a shared density/per-piece table grows) keep it a small data module
  imported by `toGrams` — pure, no I/O.

### Part 4 — Embedding rerank reuse
- [ ] Reuse the bundled model via the `useAisleMatcher`/worker pattern to embed +
  cosine-score FDC candidate descriptions vs the ingredient phrase. Recommend a
  focused rerank entry that SHARES the model load (no second download). A pure
  scoring module (mirrors `services/classifier.ts`) holds the confidence floor +
  top-pick logic so it is unit-testable without the model.

### Part 5 — Client data hook
- [ ] `src/hooks/useNutrition.ts` — the enrichment flow above (cache→query→network
  →rerank→detail→persist), the offline/partial states, and a mutation that writes
  `nutrition_cache` + back-fills `recipe_ingredients`. Client `/api/nutrition`
  fetch wrapper (token header, typed errors) mirrors `useRecipeImport.ts`.

### Part 6 — UI: nutrition panel + manual pick + detail wiring
- [ ] `src/components/molecules/NutritionPanel.tsx` (new) — presentational
  energy+macros+micros panel (per-serving / whole toggle handled by parent). Role
  tokens; pure props.
- [ ] `src/components/molecules/FoodPickerSheet.tsx` (new) — BottomSheet +
  SelectionList of FDC candidates for a low-confidence/manual re-pick. Reuse
  existing molecules.
- [ ] `src/components/organisms/RecipeNutrition.tsx` (new) — owns `useNutrition`
  for a recipe; renders the panel, per-row enrichment status + re-pick affordance,
  an "Enrich" action (if lazy), and the offline "needs connection" state.
- [ ] `src/routes/RecipeDetailRoute.tsx` (edit) — mount `<RecipeNutrition />` below
  the ingredient list. Leave the Phase 3 detail intact otherwise.
- [ ] (Optional) `src/components/molecules/RecipeIngredientRow.tsx` (edit) — show a
  small enriched/needs-review badge per row if it reads cleaner than a separate list.

### Part 7 — Unit tests
- [ ] `functions/_lib/__tests__/parseFdcFood.test.ts`
- [ ] `functions/api/__tests__/nutrition.test.ts`
- [ ] `src/utils/__tests__/toGrams.test.ts` — every Spike-2 bucket + unresolved.
- [ ] `src/services/__tests__/nutritionRollup.test.ts` — full / partial / per-serving.
- [ ] `src/services/__tests__/<rerank-scoring>.test.ts` — confidence floor + pick.
- [ ] `src/hooks/__tests__/useNutrition.test.ts` — fake-indexeddb + mocked
  `/api/nutrition`: cache hit short-circuits, miss fetches+caches+persists,
  offline-miss → unenriched, manual pick persists.
- [ ] `src/routes/__tests__/RecipeDetailRoute.test.tsx` (extend) — nutrition
  section: loading / enriched / needs-connection branches (mock `useNutrition`).

### Part 8 — E2E
- [ ] `e2e/eat-nutrition.spec.ts` (new) — mock `/api/nutrition` (route fulfill, as
  the import E2E mocks `/api/import-recipe`): save a recipe → open detail → enrich →
  per-serving panel visible; reload offline → nutrition persists; low-confidence
  row → manual pick → rollup updates. Reuse existing IDB-reset/import helpers.

### Part 9 — Offline + validate + docs + ship
- [ ] Verify offline: cached recipe scores with network off; uncached shows
  "needs connection." (Manual + an E2E assertion.)
- [ ] `npm run validate` clean; `npm run test:e2e` green; `npm run build` (the
  function typechecks under `tsconfig.functions.json`).
- [ ] Confirm NO `DB_VERSION` bump, NO `package.json` change, only the two empty
  env placeholders added.
- [ ] `PLAN.md` — move Current Status to Phase 4; set "Next" to Phase 5 (weekly
  plan & scoring). Resolve backlog open-questions: enrich trigger (lazy-on-view),
  pre-warm (none in v1), `nutrition_cache` staleness (none — `fetched_at` captured,
  no eviction per ADR-0027). On completion rename this file to
  `tasks/complete--eat-tab-phase-4.md`.
- [ ] Append the Spike-1 result table to ADR-0027's Spike-1 sub-section IF the live
  run was performed (egress permitting); otherwise note rerank shipped as an
  internal refinement with manual-pick guaranteeing correctness.
- [ ] Commit (Conventional Commits, `feat:`, NOT migration-gated). Push to
  `claude/eat-tab-next-phase-2ugdz9`.

---

## What Phase 4 explicitly does NOT do
- **No weekly plan / no scoring visualization** — `meal_plan_entries` stays
  untouched; rollup-vs-target rings/bars are Phase 5. Phase 4 displays a recipe's
  own nutrition, not its fit against the user's targets.
- **No `DB_VERSION` bump / no migration** — it writes to stores created at v9 and
  only refines `payload`'s TS type. (Surface for review; confirm no `feat(db)` gate.)
- **No new runtime dependency** — reuses the bundled embedding model + hand-written
  parsers. (Ask before any `package.json` change.)
- **No change to `normalizeIngredient` / `parseIngredientMeasure`** — Phase 4
  consumes their Phase-3 output; ADR-0021 is untouched.
- **No change to the shopping/import critical paths** — `/api/import-recipe`,
  list-dump, default-list, and offline check-off are all byte-for-byte intact.
- **No aisle placement of recipe ingredients** — `item_id` MAY be lazily linked if
  cheap, but Eat still does not place ingredients in aisles (ADR-0015 untouched).

## Risks / things to watch
- **SSRF posture must NOT be copy-pasted blindly from `import-recipe`.** That
  function fetches user URLs; nutrition must build its URL server-side from a fixed
  host + sanitized query. A reviewer should confirm no request param flows into the
  fetch destination. This is the #1 security review surface.
- **Secret handling.** `FDC_API_KEY` is a REAL secret (unlike the drive-by tokens):
  env-only, never logged, never in a response, never committed. `.env.example` gets
  an empty placeholder only.
- **Grams correctness is the load-bearing nutrition risk.** A wrong density or a
  silently-invented gram weight corrupts every downstream number. The unresolved →
  manual-entry path must trigger rather than guess; test it hard.
- **Rate limit / quota.** Lazy-on-view + aggressive `nutrition_cache` reuse keeps
  FDC calls bounded; the free-tier quota is the worst-case ceiling (ADR-0027).
  Avoid an enrich-everything-on-save storm.
- **Offline degradation must be graceful, never a throw.** A cache miss with no
  network is a UI state, not an error boundary. Test with network disabled.
- **Model reuse, not re-download.** The rerank MUST share the already-loaded
  `all-MiniLM-L6-v2`; a second pipeline/model fetch defeats the whole reuse
  rationale and bloats load. Verify one model load.
- **Nutrient-key alignment.** The rollup/panel keys must equal the
  `nutritionTargets` keys or Phase 5 needs a mapping table. Lock the key set now.
- **Scope creep into Phase 5.** Resist building plan/scoring "while we're here."

## Open questions to confirm before coding
- **No migration** — confirm Phase 4 ships with `DB_VERSION` unchanged (refining
  `payload`'s type only), not a `feat(db)` bump. (Recommended; ADR-0026 typed
  `payload: unknown` for exactly this.)
- **Enrich trigger** — lazy-on-first-view (recommended, rate-limit-friendly) vs
  eager-on-save? (ADR-0027 deferred this to Phase 4.)
- **Embedding rerank** — ship rerank now, or plain top-hit + manual pick until the
  Spike-1 numbers exist? (Recommend ship rerank as internal refinement; manual pick
  guarantees correctness either way.)
- **Function shape** — one `/api/nutrition?op=search|detail` endpoint
  (recommended) vs two routes (`/api/nutrition/search`, `/api/nutrition/food`)?
- **Density/per-piece tables** — confirm the small curated v1 set (flour, sugar,
  milk, oil, water for density; clove/slice/stick for per-piece) is enough, with
  manual-gram fallback for the rest, vs a broader bundled table.
- **`item_id` linkage** — opportunistically link `recipe_ingredients.item_id` to a
  matching catalog `items` row during enrichment (cheap, enables Phase 5 reuse), or
  leave it for Phase 5? (Recommend leave it; keep Phase 4 nutrition-only.)
- **`pinch`/`dash`** — fixed nominal grams vs always-manual? (Recommend a small
  fixed nominal so a common recipe isn't blocked on a pinch of salt.)
