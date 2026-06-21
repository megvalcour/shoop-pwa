---
step: 1
substep: 0
status: complete
class: standard
e2e_required: true
clarifications: |
  Issue 1 (focus): prioritize fast add — keep caret in the input across every add (Enter and Add-button), clear immediately.
  Issue 2 (hang): preferred fix is non-blocking categorization (add items while the model loads); a loader is the fallback only if non-blocking is infeasible.
---

# List Builder UX: Maintain Add-Input Focus + Non-Blocking Model Load

## Problem Statement

Two UX defects in the shopping-list builder (`AddItemForm` + `useAisleMatcher`):

1. **Focus is lost on each add.** After Enter or tapping **Add**, the caret leaves
   the input, so rapid entry of multiple items requires re-tapping the field
   every time.
2. **The app hangs while the model loads.** The first add (on blur/submit) primes
   the WASM model and embeds the entire catalog on the main thread, freezing all
   interaction until it finishes.

## Root-Cause Analysis

### Issue 1 — focus loss (`src/components/organisms/AddItemForm.tsx`)
- The `Input` has `disabled={isPending}` (line 82). When a submit fires, the
  mutation goes pending → the browser **blurs the now-disabled input**.
- `useAddListItem.onSuccess` returns the invalidation promise, so `isPending`
  stays `true` through the refetch — a visible window where the field is dead.
- When `isPending` flips back to `false` the input re-enables but focus is **not**
  restored.
- Tapping **Add** is doubly broken: the click moves focus to the button, and
  nothing returns it to the input.

### Issue 2 — main-thread hang (`src/hooks/useAisleMatcher.ts`)
- `ensureLoaded()` calls `pipeline('feature-extraction', …)` and then
  `buildCatalogEmbeddings()`, which **loops over every candidate phrase awaiting
  `embed()` one at a time** (lines 73–84). All of this runs on the **main thread**
  via WASM/ONNX, so the UI is blocked from model init through the last embedding.
- The lexical fast-path (`classifier.ts`) is already pure and model-free, but the
  semantic priming that runs on blur/submit is what stalls the page.

## Relevant ADRs

- **ADR-0003** — model loading + memoization are "encapsulated in
  `useAisleMatcher.ts`" and **only `AddItemForm` consumes the hook**. Moving the
  pipeline into a Web Worker keeps the hook as the single public interface, so the
  encapsulation contract holds; the worker is an implementation detail behind it.
  This is a meaningful architecture shift → record it in a new ADR (below) rather
  than deviate silently.
- **ADR-0011** — layered matching: the **lexical fast-path is pure, deterministic,
  and offline**. Keep it on the main thread so most items categorize instantly
  with no worker round-trip; only the semantic fallback needs the worker.
- **ADR-0009** — new items are created with `aisle_id: ''` until classified; the
  builder already renders these as "Uncategorized"/"Analyzing", which is exactly
  the affordance we rely on while the model loads.

## New ADR

- **ADR-0013 — "Run aisle-matching inference in a Web Worker."** Status: Accepted.
  Documents moving `pipeline()` + catalog embedding + per-query embedding off the
  main thread to keep the add flow responsive. Notes that ADR-0003's hook
  encapsulation and ADR-0011's lexical/semantic layering are preserved
  (lexical stays on the main thread; the worker only does embeddings).

---

## Plan

### Part A — Maintain input focus (Issue 1)

Goal: the caret never leaves the add field; adding an item is "type → Enter →
keep typing."

1. Add an `inputRef = useRef<HTMLInputElement>(null)` in `AddItemForm` and pass it
   to `Input` (the atom already uses `forwardRef`, so no atom change needed).
2. **Remove `disabled={isPending}` from `Input`.** This is the direct cause of the
   blur. The field stays interactive across the mutation.
3. Clear the field **immediately** in `handleSubmit` (`setValue('')` up front)
   instead of only in `onSuccess`, so back-to-back entry is never gated on the
   refetch.
4. After dispatching the add, call `inputRef.current?.focus()` so an **Add-button
   tap** returns focus to the input (Enter already keeps it, but this makes both
   paths identical and is harmless).
5. Concurrency guard (now that the input is no longer disabled): keep the **Add
   button** disabled only while `value` is empty (`!value.trim()`), not on
   `isPending`. Distinct rapid adds are safe — `useAddListItem` keys items by
   `canonical_name` and dedupes existing rows. To close the narrow same-name
   double-fire race, add a module-level **in-flight `Set<canonical_name>` guard in
   `useAddListItem`** that rejects a duplicate add already in flight. (Recommended;
   low cost. Alternative — early-return in `handleSubmit` while pending — is
   rejected because it silently drops fast entries, defeating the goal.)
6. Keep `primeMatcher()` on submit/blur unchanged in intent, but priming is now
   non-blocking (Part B), so it no longer freezes the field.

### Part B — Non-blocking categorization via Web Worker (Issue 2, preferred fix)

Goal: items can be added while the model loads **and** while classification runs;
nothing on the main thread blocks.

1. **New file `src/workers/aisleMatcher.worker.ts`** (module worker):
   - Imports `pipeline` from `@huggingface/transformers`, the pure helpers from
     `@/services/classifier`, and the catalog/alias JSON.
   - `load` message → build pipeline + catalog embeddings, then post `{ type:
     'ready' }`. All heavy work happens **off the main thread**.
   - `classify` message `{ id, phrase }` → embed + `aggregateTopK` + `THRESHOLD`,
     post `{ type: 'result', id, aisleNumber }`. The worker returns the matched
     **aisle number** (string); the hook resolves it to an aisle id against the
     live `aisles` array on the main thread (worker stays data-only, no DB).
2. **Refactor `src/hooks/useAisleMatcher.ts`** to drive the worker while keeping
   the **exact public API** (`prime`, `classify`, `isReady`):
   - Module-level singleton `Worker` created lazily on first `prime()` via
     `new Worker(new URL('../workers/aisleMatcher.worker.ts', import.meta.url), {
     type: 'module' })` (Vite bundles this correctly and code-splits transformers
     out of the main chunk).
   - A module-level `Map<id, resolver>` of pending classify requests; messages are
     correlated by `id` (use `crypto.randomUUID()`).
   - `classify()` keeps the layered order: run `lexicalMatch` **synchronously on
     the main thread first**; on a confident hit, resolve immediately (no worker,
     no await). Otherwise post to the worker and await its reply. If the worker
     isn't ready yet, return `''` (the existing deferred-reclassify effect retries
     once `isReady` flips) — unchanged behavior, just off-thread.
   - `isReady` flips when the worker posts `ready`; preserve the
     `catalogEmbeddingsCache`-equivalent "already ready" fast path so re-mounts
     don't reload.
3. `AddItemForm` is **unchanged** beyond Part A — it still calls
   `prime`/`classify`/`isReady` and runs the existing "classify items added while
   loading" effect (lines 31–44). Because priming no longer blocks, the user types
   freely while `ready` is pending; the effect back-fills aisles when it arrives.
4. Keep the existing inline **"Classifying…"** hint (line 92) — it now reflects a
   genuinely background process rather than a frozen page.

### Part C — Loader fallback (only if Part B proves infeasible)

If a module worker can't be made to work under our Vite/VitePWA setup (e.g.
transformers fails to initialize off-thread), fall back to: prime the model but
show a non-blocking **"Preparing categorizer…"** affordance derived from
`isReady`, and **still allow adds** (items land as Uncategorized and get
classified on ready). A full-screen blocking loader is the last resort and only
if adds genuinely cannot proceed — which the worker approach avoids. Expectation:
Part B lands and Part C is not needed.

---

## Build / Tooling Notes

- Vite handles `new URL(..., import.meta.url)` + `{ type: 'module' }` workers
  natively; transformers moves into its own chunk, which also trims the initial
  bundle.
- `VitePWA` `injectManifest.globPatterns` already includes `js`, so the worker
  chunk and model assets stay precached for offline use — confirm the built
  worker chunk is listed after `npm run build`.
- No `package.json` change expected (transformers is already a dependency). If any
  install proves necessary, **stop and ask the user first** per CLAUDE.md.
- Single-threaded WASM in a worker needs no COOP/COEP headers; do **not** introduce
  cross-origin isolation. If multi-threaded (SharedArrayBuffer) is ever desired,
  that's a separate decision — out of scope here.

## New Files

- `src/workers/aisleMatcher.worker.ts`
- `docs/adrs/0013-web-worker-aisle-inference.md`
- `src/components/organisms/__tests__/AddItemForm.test.tsx`
- `e2e/list-builder-ux.spec.ts`

## Updated Files

- `src/components/organisms/AddItemForm.tsx` — input ref, drop `disabled` on input,
  immediate clear, refocus after add.
- `src/hooks/useAisleMatcher.ts` — talk to the worker; preserve `prime/classify/isReady`.
- `src/hooks/useListItems.ts` — in-flight `Set` guard in `useAddListItem`.
- `PLAN.md` — set active task; move to backlog/complete on finish.

---

## Testing

- **Unit (Vitest + RTL) — `AddItemForm.test.tsx`:** with `useAisleMatcher` mocked,
  submit via Enter and via the Add button; assert `document.activeElement` is the
  input afterward and `value` is cleared. Assert the input is never `disabled`
  while pending.
- **Unit — `useListItems`:** same-name concurrent add is deduped (in-flight guard);
  distinct concurrent adds both persist.
- **Unit — `useAisleMatcher`:** mock `Worker` (manual mock posting `ready`/`result`);
  assert `prime` boots the worker once, lexical-confident queries resolve without
  posting to the worker, and semantic queries resolve via the worker reply.
- **Classifier purity:** existing `classifier` tests stay green (no logic moved,
  only its caller relocated to the worker).
- **E2E (Playwright) — `list-builder-ux.spec.ts`:** add several items rapidly and
  assert focus stays in the input and all items render; while the model is loading,
  assert the page stays interactive (type/add succeeds, no frozen UI) and that
  uncategorized items move into aisle groups once ready.
- Gate: `npm run validate` (typecheck + lint + unit), then **`npm run test:e2e`** —
  per CLAUDE.md, the change is not done while E2E is red.

## Risks / Open Questions

- Worker + happy-dom: unit tests must mock `Worker`; real inference is covered by
  E2E only.
- transformers in a module worker under VitePWA `injectManifest`: verify the model
  fetch + ONNX init succeed off-thread in the built PWA (the E2E run validates this).
- Deferred-reclassify timing: confirm the "classify items added while loading"
  effect still fires exactly once on `isReady` with the new worker-driven flag.
