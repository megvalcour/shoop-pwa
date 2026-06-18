---
step: 8
substep: 1
status: code_review
class: standard
e2e_required: true
clarifications: |
  Manual aisle override: Badge → bottom sheet (tap aisle badge opens a modal/bottom sheet with full aisle list)
  Model loading state: Analyzing indicator (show subtle 'Analyzing…' badge on new item; update silently when resolved)
  Classification failure: Uncategorized group (low-confidence items placed in 'Uncategorized' section at bottom of list)
  Checked items + grouping: Separate Done section (all checked items move to single 'Done' section below all aisle groups)
---

# Smart Aisle Location (Market Basket 62)

## Relevant ADRs

- **ADR-0003** — mandates `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2`; WASM/ONNX in-browser; hook encapsulated in `src/hooks/useAisleMatcher.ts`; **only `AddItemForm` organism may consume this hook directly**
- **ADR-0009** — `items` store has `aisle_id: string` (Index); new items are created with `aisle_id: ''` until classified

## Architecture Notes

- `useAisleMatcher` uses a module-level singleton for the pipeline (loaded once, never re-created across re-renders or re-mounts)
- Aisle label embeddings are pre-computed once on model load and cached at module level
- Classification uses L2-normalized mean-pooled embeddings → dot product = cosine similarity
- Confidence threshold: cosine similarity ≥ 0.5 → assigns aisle; < 0.5 → returns `''` (uncategorized)
- Items with `aisle_id: ''` show an "Analyzing…" badge until classified; `AddItemForm` runs a background effect to classify all pending items when the model becomes ready
- `ShoppingListBuilder` groups unchecked items by aisle (sorted by `sort_order`), items with `aisle_id: ''` go in "Uncategorized" section, all checked items go in a "Done" section at the very bottom
- `AislePickerSheet` and `AisleGroup` are molecules (no store access); aisles array is passed down from `ShoppingListBuilder` via props

## New Files

- `src/hooks/useAisleMatcher.ts`
- `src/hooks/useAisles.ts`
- `src/components/molecules/AisleGroup.tsx`
- `src/components/molecules/AislePickerSheet.tsx`
- `src/hooks/__tests__/useAisleMatcher.test.ts`
- `src/components/molecules/__tests__/AisleGroup.test.tsx`
- `src/components/molecules/__tests__/AislePickerSheet.test.tsx`
- `e2e/smart-aisle-location.spec.ts`

## Updated Files

- `src/hooks/useItems.ts` — add `useUpdateItemAisle` mutation
- `src/components/organisms/AddItemForm.tsx` — integrate `useAisleMatcher`; background classify effect
- `src/components/organisms/ShoppingListBuilder.tsx` — group by aisle; Done section
- `src/components/molecules/GroceryListItem.tsx` — add aisle badge + `AislePickerSheet`

---

## Checklist

### Phase 0 — Prerequisites

- [x] 0.1 Install `@huggingface/transformers` (ask user before running — CLAUDE.md requires consent for package.json changes)
  - `npm install @huggingface/transformers`
  - Confirm it appears in `dependencies` (runtime, not devDependencies — model runs in the browser)

### Phase 1 — Data Layer

- [x] 1.1 Add `useUpdateItemAisle` to `src/hooks/useItems.ts`
  - Input: `{ itemId: string; aisleId: string }`
  - `mutationFn`: `db.get('items', itemId)` then `db.put('items', { ...item, aisle_id: aisleId })`
  - `onSuccess`: `invalidateQueries({ queryKey: ['items'] })`

- [x] 1.2 Create `src/hooks/useAisles.ts`
  - `useAisles(storeId?: string)`: returns all aisles, optionally filtered by `store_id` index, sorted by `sort_order`
  - `queryKey: ['aisles', storeId ?? 'all']`
  - Use `db.getAllFromIndex('aisles', 'store_id', storeId)` when `storeId` provided; `db.getAll('aisles')` otherwise

### Phase 2 — useAisleMatcher Hook

- [x] 2.1 Create `src/hooks/useAisleMatcher.ts`
  - Module-level: `let pipelinePromise: Promise<...> | null = null` — lazily initialized on first hook mount
  - Module-level: `let catalogEmbeddingsCache: { item: string; aisle: string; embedding: number[] }[] | null = null`
  - On first mount: call `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })`, then build the catalog from `oxford-62.json`:
    1. Build `aisleById: Map<string, { number: string }>` from the `aisles[]` array
    2. For each entry in `items[]`, resolve its `aisle_id` via `aisleById`
    3. Keep only entries where the resolved `aisle.number` matches `/^\d+$/` (purely numeric; skip `"Produce Dept"`, `"Deli/Fish Dept"`, etc.)
    4. Embed each kept item's `canonical_name` using `{ pooling: 'mean', normalize: true }`, store as `{ item: canonical_name, aisle: aisle.number, embedding }`
    - Yields approximately 166 entries (182 total; 16 belong to named non-numeric sections)
  - Hook exposes `{ classify(itemName: string, aisles: Aisle[]): Promise<string>; isReady: boolean }`
  - `classify`:
    1. Embed `itemName` (pooling: mean, normalize: true)
    2. Compute dot product against each entry in `catalogEmbeddingsCache`
    3. Take the best-scoring entry; if score ≥ 0.5, extract its `aisle` number string (e.g. `"21"`)
    4. Find the matching `Aisle` in the passed `aisles` array where `String(aisle.number) === catalogAisleNumber`
    5. Return that `Aisle.id`, or `''` if no catalog match above threshold or no DB aisle found
  - Helper: `dotProduct(a: number[], b: number[]): number` — `a.reduce((s, v, i) => s + v * b[i], 0)`
  - Set `isReady = true` (via `useState`) once pipeline + catalog embeddings are both cached
  - **Singleton coordination**: in the init `useEffect`, always `await pipelinePromise` (even if it was set by a prior mount) before setting `isReady = true` — this ensures components mounting after model load skip the wait and set ready immediately

### Phase 3 — AddItemForm Integration

- [x] 3.1 Update `useAddListItem` in `src/hooks/useListItems.ts` to return `newItemId: string` in `AddListItemResult` so `AddItemForm` can immediately classify the new item
  - Change `AddListItemResult` to `{ itemCreated: boolean; newItemId: string }` and return `itemId` from the `mutationFn`
  - In the early-exit duplicate path (item already in list — currently returns `{ itemCreated: false }` at line 59), return `{ itemCreated: false, newItemId: '' }` — the empty string signals `AddItemForm` to skip classification

- [x] 3.2 Update `src/components/organisms/AddItemForm.tsx`
  - Import `useAisleMatcher`, `useItems`, `useUpdateItemAisle`, `useAisles`
  - Call `useAisles()` to get the current store's aisles; pass the result to `classify` for aisle number → ID resolution
  - After successful `mutate`: call `classify(name, aisles)` then `updateItemAisle.mutate({ itemId: newItemId, aisleId })` when `isReady`; if `!isReady`, the background effect (below) will catch it
  - `useEffect([isReady])`: when `isReady` becomes `true`, filter `items` where `aisle_id === ''`, classify each via `classify(item.name, aisles)`, call `updateItemAisle.mutate` for each
  - Show a subtle "Classifying…" status line below the form when `!isReady && items.some(i => i.aisle_id === '')`; hide once `isReady`

### Phase 4 — New Molecules

- [x] 4.1 Create `src/components/molecules/AisleGroup.tsx`
  - Props: `interface AisleGroupProps { label: string; number?: string; children: React.ReactNode; isSpecial?: boolean }`
  - Renders a sticky section header with aisle number + label (or just label for "Uncategorized"/"Done")
  - `isSpecial` applies a muted/italic style for Uncategorized and Done headers
  - Wraps children in a `<ul>`

- [x] 4.2 Create `src/components/molecules/AislePickerSheet.tsx`
  - Props: `interface AislePickerSheetProps { aisles: Aisle[]; currentAisleId: string; onSelect: (aisleId: string) => void; onClose: () => void }`
  - Fixed-position overlay with semi-transparent backdrop; clicks on backdrop call `onClose`
  - Bottom-anchored panel (translate-y slide from bottom); scrollable list of aisles
  - Each row: aisle label + number; current selection highlighted with `text-primary` + checkmark icon
  - Close button (×) in header

### Phase 5 — GroceryListItem Update

- [x] 5.1 Update `src/components/molecules/GroceryListItem.tsx`
  - Add props: `aisleLabel?: string; isAnalyzing?: boolean; aisles?: Aisle[]; onAisleChange?: (aisleId: string) => void; currentAisleId?: string`
  - Add local state: `sheetOpen: boolean`
  - Show aisle badge to the right of the item name:
    - `isAnalyzing === true`: small grey badge with "…" text (pulsing animation)
    - `aisleLabel` is set: small tappable badge showing label; tap sets `sheetOpen = true`
    - Neither: no badge
  - Render `<AislePickerSheet>` when `sheetOpen && aisles && onAisleChange`; `onSelect` calls `onAisleChange` then closes sheet
  - Import `Aisle` type from `@/db/schema`

### Phase 6 — ShoppingListBuilder Grouping

- [x] 6.1 Update `src/components/organisms/ShoppingListBuilder.tsx`
  - Import `useAisles`, `useUpdateItemAisle`, `AisleGroup`, `Aisle` type
  - Call `useAisles()` to get all aisles; build `aisleById: Map<string, Aisle>`
  - Build `itemById: Map<string, Item>` from `useItems()` result
  - Partition `listItems` into `unchecked` and `checked`
  - Group `unchecked` by `item.aisle_id`:
    - `''` or missing → `uncategorized[]`
    - valid aisle_id → bucket by aisle; sort buckets by `aisle.sort_order`
  - Render order: aisle groups (sorted) → "Uncategorized" group (if any) → "Done" group (checked items)
  - Pass `aisleLabel`, `isAnalyzing` (item.aisle_id === ''), `aisles`, `currentAisleId`, `onAisleChange` to each `GroceryListItem`
  - `onAisleChange` calls `updateItemAisle.mutate({ itemId: item.id, aisleId })`
  - Remove the old flat `sorted` array and `<ul>` wrapper — `AisleGroup` now handles list wrapping

### Phase 7 — Unit Tests

- [x] 7.1 Create `src/hooks/__tests__/useAisleMatcher.test.ts`
  - Mock `@huggingface/transformers`: `pipeline` returns a function that returns `{ tolist: () => [[...embedding]] }`
  - Mock `oxford-62.json` catalog import to a minimal set: e.g. `[{ item: 'Bread', aisle: '21' }, { item: 'Butter', aisle: '1' }]`
  - Test: `classify('hot dog rolls', aisles)` returns the `aisle_id` of aisle 21 when Bread is the best catalog match (dot product > 0.5) and the aisles array contains an aisle with `number === 21`
  - Test: `classify('xyz', aisles)` returns `''` when all dot products < 0.5
  - Test: `classify('Bread', aisles)` returns `''` when the matched catalog aisle number has no corresponding entry in the `aisles` array (unmapped aisle)
  - Test: `isReady` starts `false`, becomes `true` after async model load

- [x] 7.2 Create `src/components/molecules/__tests__/AisleGroup.test.tsx`
  - Renders header with label and number
  - Renders children

- [x] 7.3 Create `src/components/molecules/__tests__/AislePickerSheet.test.tsx`
  - Renders list of aisles
  - Calls `onSelect` with correct `aisleId` on row click
  - Calls `onClose` on backdrop click

- [x] 7.4 Update `src/components/organisms/__tests__/ShoppingListBuilder.test.tsx`
  - Test: unchecked items with known `aisle_id` are grouped under correct `AisleGroup`
  - Test: items with `aisle_id: ''` appear in "Uncategorized" group
  - Test: checked items appear in "Done" group below aisle groups

### Phase 8 — E2E Tests

- [x] 8.1 Create `e2e/smart-aisle-location.spec.ts`
  - `beforeEach`: use `page.evaluate` to seed IndexedDB with a known store, 2–3 aisles, items, and list_items where `aisle_id` is pre-set to a known aisle — this makes grouping and badge assertions deterministic without waiting for model classification
  - Navigate to the seeded shopping list
  - Verify aisle group headers render with the correct labels
  - Verify checked items appear in the "Done" section
  - Tap an aisle badge on a seeded item; verify `AislePickerSheet` opens
  - Select a different aisle from the sheet; verify the badge updates to the new label
  - Add a new item via the form; verify it appears (aisle group placement is non-deterministic — just assert it's visible)

---

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.

**Status**: Security review done. No issues found. Ready for code review.
