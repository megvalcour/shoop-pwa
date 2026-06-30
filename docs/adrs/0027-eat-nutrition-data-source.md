# Source nutrition from USDA FoodData Central via a second first-party Cloudflare Function, cached in IndexedDB

## Status

Accepted

## The Problem

Nutrition scoring needs per-food nutrient data from USDA FoodData Central (FDC), which requires an API key and a network call — conflicting with the project's offline-first, no-remote-server framing.

## The Solution

A second stateless first-party Cloudflare Pages Function (`/api/nutrition`) holds the FDC key server-side and proxies FDC search/detail, while every fetched food's nutrient payload is cached in the `nutrition_cache` IndexedDB store so a re-opened planned recipe works offline.

## Options Considered

- **First-party `/api/nutrition` function mirroring ADR-0019, with IndexedDB caching** — selected.
- Call a nutrition API directly from the client — rejected: ships the API key in the bundle (a real secret, unlike ADR-0019's drive-by token), and gives no server-side point to enforce the host allowlist or shape responses.
- Bundle a static nutrition dataset into the app — rejected: a full FDC export is large, goes stale, and still misses arbitrary user-imported ingredients; it trades a network dependency for a bundle-size and freshness problem without solving coverage.

## Rationale

This is the **second** server-side execution surface in the project, and per ADR-0019's explicit clause ("future functions must each justify themselves against this record"), it is bounded the same way: stateless, no persistence, holds no user data, and touches no IndexedDB. The function exists solely to keep the FDC key off the client and to centralize the request guards. The offline shopping/check-off critical path (ADR-0001/0002) is entirely unaffected — Eat enrichment is the only thing that needs the network, and it degrades gracefully.

**Security posture — mirrors ADR-0019, tightened where it can be:**

1. **Host allowlist, not an open proxy.** Unlike `/api/import-recipe` (which fetches arbitrary user-supplied URLs), `/api/nutrition` only ever talks to the single FDC host. The allowlist is one host; there is no SSRF surface for user-controlled destinations. Scheme is `https` only; redirects off; response-size cap (~2 MB) and hard timeout (~8 s via `AbortController`).
2. **Shared request token (`X-Shoop-Nutrition`).** The function requires a header matching a Pages env var; the client sends it from a build-time `VITE_NUTRITION_TOKEN`. As in ADR-0019 this is not a true secret (it ships in the bundle) — it drops drive-by path scanners for near-zero effort.
3. **The real secret — `FDC_API_KEY` — lives only in the Pages project env**, never committed; only an empty `FDC_API_KEY=` placeholder goes in `.env.example`.
4. **Per-IP rate-limit rule** on `/api/nutrition` (Cloudflare dashboard, free tier), and the free-plan daily quota as the worst-case ceiling: abuse caps out at "enrichment unavailable until reset," not a bill. Even a full function compromise leaks nothing — no user data, and the only secret is a free, rate-limited public-data key.

**Parser isolation:** the FDC-response → internal-nutrient-shape mapping lives in a pure `functions/_lib/*` module (e.g. `parseFdcFood.ts`) with no network dependency, unit-testable without mocking `fetch` — matching the `parseRecipeJsonLd.ts` precedent.

**Offline degradation:** a fresh, never-seen ingredient has no cached nutrition when offline. The UI surfaces an explicit "needs connection to enrich" state for that ingredient/recipe rather than blocking; already-enriched recipes (cached in `nutrition_cache`) score fully offline.

## Notes

**"No remote server" framing (CLAUDE.md):** this function is recorded here precisely because it is the second such surface. It does not implicitly widen the framing — it is stateless, read-only against a single public-data host, stores nothing, and holds no user data.

### Spike 1 findings — FDC match quality (HF-rerank validation)

The Eat epic recommended reusing the in-browser embedding model (`Xenova/all-MiniLM-L6-v2`, ADR-0003) to rerank noisy FDC text-search results. Phase 0 spiked this against ~30 real imported ingredients (`scripts/spikes/fdc-match/`).

> **Findings:** see `scripts/spikes/fdc-match/FINDINGS.md` (committed with this phase). Verdict recorded there governs whether Phase 4 ships embedding-rerank or falls back to plain top-hit. In all cases a **manual-pick fallback for low-confidence matches** is assumed (the user can always correct the chosen food).

### Spike 2 findings — quantity → grams feasibility

Nutrition math needs grams; recipe units are mass / volume / count-or-container. Phase 0 bucketed the `normalizeIngredient` `UNITS` vocabulary and checked FDC `foodPortions` coverage.

> **Findings:** see `scripts/spikes/fdc-match/FINDINGS.md` (unit coverage map). The `recipe_ingredients.grams` field (ADR-0026) is the escape hatch for units that need a manual gram entry; mass units convert with a static table, volume units need an ingredient density, count/container units lean on FDC `foodPortions` with a manual fallback.

### Deferred to Phase 4

- Pre-warm strategy: enrich-on-save vs lazy-on-first-view (cost/UX trade-off measured against the rate limit).
- `nutrition_cache` staleness policy (`fetched_at` is captured now; no eviction in v1).
