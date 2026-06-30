# Eat Phase 0 — FDC spikes

Throwaway decision-spike code for the Eat tab epic. **Not imported by `src/`**;
exists only to produce the findings in `FINDINGS.md` that back ADR-0026 / 0027.
Safe to delete once the Eat enrichment pipeline (Phase 4) ships.

## Files

| File | What |
|---|---|
| `unit-coverage.mjs` | Spike 2: buckets the real `UNITS` vocab → grams-convertibility map. Pure/offline. |
| `fdc-match.mjs` | Spike 1: plain FDC search vs embedding-rerank hit-rate over `ingredients.json`. Needs network + key. |
| `ingredients.json` | 30 real imported-recipe ingredient lines + intended FDC food, spanning unit buckets. |
| `FINDINGS.md` | Recorded results + verdicts. |
| `unit-coverage.json` / `match-results.json` | Generated raw output. |

## Run

Spike 2 (no network, no key):

```bash
node scripts/spikes/eat-fdc/unit-coverage.mjs
```

Spike 1 (needs a free FDC key + reach to `api.nal.usda.gov` and `huggingface.co`):

```bash
FDC_API_KEY=DEMO_KEY NODE_USE_ENV_PROXY=1 node scripts/spikes/eat-fdc/fdc-match.mjs
```

Get a key at <https://fdc.nal.usda.gov/api-key-signup.html> (`DEMO_KEY` works at
low volume). **Never commit a key.** In sandboxes whose egress policy blocks
`api.nal.usda.gov`, this spike cannot run — see the note in `FINDINGS.md`.
