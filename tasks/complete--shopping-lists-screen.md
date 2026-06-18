---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: true
code_review_level: medium
clarifications: |
  1. Auto-generated list name: "[Store Name] - Month DD" (e.g., "Oxford Market Basket #62 - June 17"); store name read from first stores record in IndexedDB (no switcher yet)
  2. Delete UI deferred to later story; useDeleteShoppingList hook method included but not wired to UI
  3. Tapping a list navigates to /lists/:id stub route
  4. E2E required: yes
---

# Shopping Lists Screen — Index View & useShoppingLists Hook

## Relevant ADRs

- **ADR-0009**: `shopping_lists` (id, name, created_at) + `list_items` (id, list_id Index, item_id, quantity, checked, added_from_default). All list operations must use these stores and field shapes.
- **ADR-0004**: TanStack Query for persistent data reads/writes; Zustand for ephemeral UI state only. No IndexedDB access in components.
- **ADR-0005**: Atomic Design — card UI in `molecules/`, route components in `routes/`.
- **ADR-0006**: React Router v7 library mode for routing.

## Dependency Note

`@tanstack/react-query` is not yet installed. User approval required before `npm install` per CLAUDE.md.

## Implementation Steps

### Pre-flight
- [x] Obtain user approval and install `@tanstack/react-query`
- [x] Create `src/hooks/` directory (does not exist yet)
- [x] In `src/main.tsx`: create `const queryClient = new QueryClient()` and wrap `<App />` with `<QueryClientProvider client={queryClient}>`

### Phase 2 — useShoppingLists hook
- [x] Create `src/hooks/useShoppingLists.ts`
  - `useShoppingLists()`: `useQuery({ queryKey: ['shopping_lists'], queryFn })` — reads all records from `shopping_lists` via `dbPromise`, sorted descending by `created_at`
  - `useCreateShoppingList()`: `useMutation` — reads first store name from `stores` ObjectStore; generates name `"[Store Name] - Month DD"` via `Intl.DateTimeFormat`; creates record with `crypto.randomUUID()` id + `new Date().toISOString()` created_at; returns the new `ShoppingList` record; invalidates `['shopping_lists']` on success
  - `useDeleteShoppingList()`: `useMutation` — deletes record by id from `shopping_lists`; invalidates `['shopping_lists']` on success

### Phase 3 — ShoppingListCard molecule
- [x] Create `src/components/molecules/ShoppingListCard.tsx`
  - Props: `{ list: ShoppingList; onClick: () => void }`
  - Display: list name + formatted `created_at` (e.g., "June 17, 2026")
  - Full-width tappable row; no internal navigation logic

### Phase 4 — Shopping Lists index route
- [x] Replace stub in `src/routes/ShoppingListsRoute.tsx`
  - `useShoppingLists()` for data; handle `isPending` + `isError` states
  - Render `ShoppingListCard` per list; `onClick` → `navigate('/lists/${list.id}')`
  - Empty state: "No lists yet. Tap + to create one."
  - Fixed bottom-right FAB (+): `aria-label="New list"`; calls `mutateAsync()` from `useCreateShoppingList`, then `navigate('/lists/${newList.id}')` on resolution (import `useNavigate` from `react-router`)
  - Disable FAB while `mutation.isPending`

### Phase 5 — Shopping List detail stub
- [x] Create `src/routes/ShoppingListDetailRoute.tsx`
  - Read `:id` param with `useParams`
  - Use `useShoppingLists()` to find matching list by id; render name as heading
  - "Coming soon" placeholder body

### Phase 6 — Router wiring
- [x] Add `{ path: 'lists/:id', element: <ShoppingListDetailRoute /> }` as child of AppShell route in `src/App.tsx` and import `ShoppingListDetailRoute`

### Phase 7 — Unit tests
- [x] Create `src/hooks/__tests__/useShoppingLists.test.ts`
  - Use `fake-indexeddb/auto` + `IDBFactory` reset in `beforeEach` + `vi.resetModules()` per existing DB test pattern
  - Import `{ renderHook, waitFor }` from `@testing-library/react`; wrap each `renderHook` call with a `wrapper` using a fresh `QueryClient` per test
  - `useShoppingLists`: returns empty array when no lists exist; returns lists sorted descending by `created_at` (use `waitFor` to await settlement)
  - `useCreateShoppingList`: after `act(() => result.current.mutate(...))`, use `waitFor` to confirm list grows by 1; name matches `"[Store Name] - \w+ \d+"`, id is UUID string, `created_at` is ISO string
  - `useDeleteShoppingList`: after mutation, use `waitFor` to confirm one fewer record returned

### Phase 8 — E2E tests
- [x] Create `e2e/shopping-lists.spec.ts`
  - Navigate to `/`; assert empty state text visible
  - Find FAB via `page.getByRole('button', { name: /new list/i })`; click it → new list card appears; name matches pattern `/Oxford.* - \w+ \d+/`
  - Click list card → URL matches `/lists/[uuid-pattern]`

**Review**: Approved by fresh session. Patched: `waitFor` usage added to Phase 7, FAB `aria-label` + Playwright selector specified in Phases 4 & 8, `QueryClient` instantiation clarified in pre-flight, `hooks/` directory creation noted, `useNavigate` import called out. Ready to implement.

**Status**: Implementation done. All 14 unit tests passing (typecheck + lint clean). Also patched `AppShell.test.tsx` to add `QueryClientProvider` wrapper and moved `fake-indexeddb/auto` to global `test-setup.ts`. Ready for validation.

**Status**: Security review passed. No XSS, injection, or credential issues found. Fully offline, all data rendered as React text content, IDs via `crypto.randomUUID()`. Ready for code review.

**Code review (medium)**: 4 issues fixed — (1) `useDeleteShoppingList` now cascade-deletes `list_items` in a single transaction; (2) `handleNewList` wrapped in try/catch to prevent unhandled rejection; (3) production `QueryClient` set `retry: false`; (4) `ShoppingListDetailRoute` adds proper loading/not-found states. Clean.
