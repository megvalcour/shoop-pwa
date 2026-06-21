# Run aisle-matching inference in a Web Worker

## Status

Accepted

## The Problem

Priming the semantic matcher on the add-item flow ran model init, catalog
embedding, and per-query embedding on the main thread, freezing all interaction
(typing, tapping Add) until the work finished.

## Options Considered

- **Move `pipeline()` + catalog embedding + per-query embedding into a dedicated
  module Web Worker, keep the lexical fast-path on the main thread** (selected).
- Show a blocking "Preparing categorizer…" loader and gate adds until the model
  is ready — rejected: it still stalls the primary task (adding items) and only
  relabels the freeze.
- Keep everything on the main thread but chunk the embedding loop with
  `setTimeout`/`requestIdleCallback` yields — rejected: brittle, still contends
  for the main thread, and does not help the model-init stall.

## Rationale

The embedding work is CPU-bound WASM/ONNX with no DOM dependency, so it is a
natural fit for a worker. Moving it off-thread keeps the add flow fully
responsive: items are added immediately (as Uncategorized, per ADR-0009) and the
worker back-fills aisles as classifications resolve. Vite bundles
`new Worker(new URL(..., import.meta.url), { type: 'module' })` natively and
code-splits `@huggingface/transformers` into the worker chunk, which also trims
the initial bundle.

The change preserves the prior architecture contracts:

- **ADR-0003 / ADR-0011 encapsulation** — `useAisleMatcher.ts` keeps its exact
  public API (`prime`, `classify`, `isReady`) and remains the sole consumer-facing
  interface; the worker is an implementation detail behind it, and `AddItemForm`
  is unchanged beyond the focus fix.
- **ADR-0011 layering** — the pure lexical fast-path (`classifier.ts`) stays on
  the main thread so most items categorize instantly with no worker round-trip;
  only the semantic fallback posts to the worker. The worker reuses the same pure
  scoring functions (`buildCandidates`, `aggregateTopK`, `THRESHOLD`, `TOP_K`).

## Notes

- The worker is **data-only**: it returns an aisle `number`; the main thread
  resolves it to an aisle id against the live `aisles` array, keeping all
  IndexedDB access out of the worker.
- Single-threaded WASM in a worker needs no COOP/COEP headers; cross-origin
  isolation (SharedArrayBuffer / multi-threaded ONNX) is intentionally **not**
  introduced here and would be a separate decision.
- `VitePWA` `injectManifest.globPatterns` already includes `js`, so the worker
  chunk and model assets remain precached for offline use.
- Unit tests mock the global `Worker`; real off-thread inference is covered by the
  Playwright E2E suite.
