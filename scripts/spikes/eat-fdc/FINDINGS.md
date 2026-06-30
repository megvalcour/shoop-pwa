# Eat Phase 0 — Spike Findings

Throwaway spikes for the Eat tab epic (`tasks/active--eat-tab-phase-0.md`).
Code in this folder is **not** imported by `src/`.

---

## Spike 2 — quantity → grams feasibility ✅ COMPLETE

Ran `node scripts/spikes/eat-fdc/unit-coverage.mjs` against the real `UNITS`
vocabulary in `src/utils/normalizeIngredient.ts`.

| Bucket | Tokens | Share | Conversion path to grams |
|---|---|---|---|
| **Mass** (`oz`, `lb`, `g`, `kg` + plurals) | 13 | ~15% | **Auto** — static factor table (`g:1, kg:1000, oz:28.35, lb:453.59`). |
| **Volume** (`cup`, `tbsp`, `tsp`, `ml`, `l`, `qt`, `pt`, `gal`, `pinch`, `dash` …) | 36 | ~41% | Static **ml** factor → grams **needs an ingredient density** (g/ml). |
| **Count / container** (`clove`, `can`, `slice`, `bunch`, `head`, `package`, `stick`, `jar` …) | 38 | ~44% | **Needs a per-piece gram weight** — FDC `foodPortions` first, manual table fallback. |

**Findings:**
- Only ~15% of the unit vocabulary converts to grams with no extra data. The
  remaining ~85% need either a density (volume) or a per-piece weight (count).
- This **confirms the `recipe_ingredients.grams?` escape hatch** in ADR-0026 is
  necessary, not optional: any unit the pipeline can't resolve falls back to a
  user-entered gram value.
- Phase 4 conversion scope: (1) static mass table, (2) a small curated density
  table for the common volume×ingredient pairs (flour, sugar, milk, oil, water),
  (3) FDC `foodPortions` lookup for count/container units, (4) manual-gram
  fallback for everything unresolved. Pinch/dash are imprecise — treat as manual
  or a fixed nominal.

Raw output: `unit-coverage.json`.

---

## Spike 1 — FDC match quality (plain search vs embedding-rerank) ⏳ HARNESS READY, LIVE RUN BLOCKED HERE

Harness: `node scripts/spikes/eat-fdc/fdc-match.mjs` over the 30-ingredient
fixture (`ingredients.json`). It queries FDC for each normalized noun phrase,
takes the plain top hit, embedding-reranks the top-10 candidates with
`Xenova/all-MiniLM-L6-v2` (the same model the app loads, ADR-0003), scores both
against the human-judged `intendedFood`, and tallies plain vs rerank hit-rate.

**Status in this environment: could not execute live.** This session's egress
policy denies `api.nal.usda.gov` (the agent proxy returns `connect_rejected` /
403 on CONNECT; confirmed in `/__agentproxy/status`). Per the proxy README,
org-policy host denials are not to be routed around. The harness itself runs
end-to-end (fixture load, fetch, rerank, tally all execute; only the network
egress is blocked), so it is **one command from producing numbers wherever
`api.nal.usda.gov` and `huggingface.co` are reachable**:

```
FDC_API_KEY=DEMO_KEY NODE_USE_ENV_PROXY=1 node scripts/spikes/eat-fdc/fdc-match.mjs
```

**Verdict criteria (decide when the numbers land):**
- rerank delta **≥ +10 pts** over plain top-hit → ship embedding-rerank in Phase 4.
- smaller/zero delta → plain top-hit is enough; skip the rerank complexity.

**Why this does not block Phase 0's ADRs:** the rerank is a Phase 4 *implementation
detail of the matching step*, and ADR-0027 specifies a **manual-pick fallback for
low-confidence matches regardless of the outcome**. So the data-source decision
(first-party `/api/nutrition` + IndexedDB cache) and the match-correctness
guarantee (user can always correct the chosen food) hold either way. Spike 1's
result only tunes *how good the automatic first guess is*. ADR-0027 records this
explicitly and is Accepted with the rerank question marked pending the live run.

When run, paste the summary table here and into ADR-0027's Spike-1 sub-section.
Raw output will be `match-results.json`.
