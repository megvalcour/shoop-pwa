# Use @huggingface/transformers for In-Browser Semantic Aisle Matching

## Status

Accepted

## The Problem

We need to classify free-text grocery item names to a store aisle without a network round-trip.

## The Solution

Use `@huggingface/transformers` (Transformers.js v3) to run `Xenova/all-MiniLM-L6-v2` in-browser via WASM + ONNX for fully offline aisle classification.

## Options Considered

- Server-side embedding API (OpenAI, Cohere) — requires network, violates offline constraint
- Rule-based keyword matching — brittle, high maintenance
- `@xenova/transformers` (Transformers.js v2) — community fork, no longer actively maintained
- **`@huggingface/transformers` (Transformers.js v3) — official HuggingFace continuation, WASM + ONNX execution in-browser**

## Rationale

`@huggingface/transformers` is the official v3 successor to the Xenova fork; it is actively maintained by HuggingFace and ships better WASM threading support. Running `Xenova/all-MiniLM-L6-v2` locally means aisle classification works fully offline after the initial model download, which is cached by the service worker. No API key, no latency, no cost per inference.

## Notes

- Model loading and memoization are encapsulated in `src/hooks/useAisleMatcher.ts`.
- Only the `AddItemForm` organism consumes this hook directly; no other component imports it.
- The model WASM assets are large; they are excluded from the Vite inline threshold and served as separate chunks.
