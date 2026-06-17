## Current Status

`feat(db): bootstrap IndexedDB foundation with schema, migrations, Oxford seed data, and Vitest setup`

## Active Task

None.

## Backlog

Each slice is a task.

**Slice 2 — TanStack Query + IDB Adapter**

- Wire `persistQueryClient` to IndexedDB as the storage backend
- Build custom hooks: `useStores`, `useAisles`, `useItems`, `useDefaultList`, `useWeeklyList`
- Establish query key conventions and invalidation patterns
- Unit test: each hook returns correct shape, mutations invalidate correctly

**Slice 3 — Zustand UI Store**

- Create `useUIStore` slice for active tab, expanded aisles, search state
- Unit test: slice actions update state correctly

**Slice 4 — Atomic Design Shell**

- Atoms: `Button`, `Checkbox`, `Input`, `Badge`, `Icon`
- Molecules: `GroceryItem`, `AisleGroup`, `SearchBar`
- Template: `AppShell` with bottom nav and route outlet
- Configure path aliases (`@/components/...`)
- Unit test: atoms render and respond to props; molecules compose correctly

**Slice 5 — React Router v7 Routes**

- Define routes: `/default-list`, `/weekly`, `/shop`, `/settings`
- Nest under `AppShell`, lazy-load route components
- Unit test: routes resolve to correct components

**Slice 6 — Default List View**

- Organism: `DefaultListEditor` — items grouped by aisle, sorted by `sort_order`
- Add/edit/delete mutations via hooks, empty states, loading skeletons
- Unit test: grouping logic, mutation calls, empty/loading state rendering

**Slice 7 — Semantic Classifier (parallel-able)**

- Load `Xenova/all-MiniLM-L6-v2` in a Web Worker via `classifier.ts`
- Cosine-similarity match against aisle embeddings, return top suggestion + confidence
- Unit test: known items resolve to correct aisles, low-confidence inputs handled gracefully

**Slice 8 — Add Item Flow**

- `SearchBar` triggers classifier, displays aisle suggestion with accept/override UI
- Commit new item to IndexedDB via mutation hook
- Unit test: classifier result populates form, override saves correctly, duplicate handling

**Slice 9 — Weekly List Builder**

- Bulk-copy `default_list` → `weekly_list` scoped to current `week_start`
- One-off item add (reuses Slice 8 flow, weekly-scoped)
- Organism: `WeeklyListBuilder` — grouped with per-aisle item counts
- Unit test: bulk copy idempotent on re-run, one-offs don't bleed into default list

**Slice 10 — Shopping View**

- Read `weekly_list` sorted by aisle `sort_order`, fully offline
- Tap-to-check: optimistic UI update + background IndexedDB write
- Checked items muted, collapsible per aisle
- Unit test: check state persists after remount, optimistic rollback on write failure

**Slice 11 — PWA Hardening**

- `vite-plugin-pwa` manifest, service worker pre-caches assets + WASM weights
- `beforeinstallprompt` capture for custom install banner
- E2E (Playwright): full add → weekly → shop → check-off flow across mobile viewport
