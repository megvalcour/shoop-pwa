---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: true
code_review_level: medium
clarifications: |
  1. Store logo derived from slug (no schema change). Path: /store-logos/${slug}.png. Rename/add PNG file as needed.
  2. Shop tab navigates directly to most recently created list's detail view (replace: true). If no list exists, show empty state with create CTA.
  3. Store Switcher is explicitly out of scope. Settings contains only: list of lists + Default List entry point.
  4. Delete shopping list is out of scope.
  5. E2E tests required: yes.
---

# UX Navigation Overhaul

**Relevant ADRs:**
- ADR-0005 (Atomic Design) — top nav data-fetching must live in a `StoreHeader` organism, not directly in the AppShell template
- ADR-0006 (React Router v7) — route components in `src/routes/`; redirect handled via `useNavigate` + `useEffect` inside the route component
- ADR-0004 (Zustand + TanStack Query) — store data fetched via new `useStores` TanStack Query hook; no Zustand for this persistent data
- ADR-0008 (Design tokens) — top nav uses `--color-primary`, `--color-primary-foreground`; no raw hex values in component files

**Out of scope:** Delete shopping list, Store Switcher, Default List editor, `updated_at` on ShoppingList (`created_at` sort is the proxy for "most recent").

**ADR flag:** This task defines the primary navigation architecture (Shop as root redirect, Settings as list manager). Flag for ADR at wrap-up.

**Logo note:** A PNG at `public/store-logos/oxford-62.png` is required for the store logo to render. The app works without it — `StoreLogo` hides on image error.

---

## Implementation Checklist

### Asset directory
- [ ] Confirm `public/store-logos/` directory exists with `oxford-62.png` present. Logo path convention: `/store-logos/{slug}.png`.

### Data layer
- [x] Create `src/hooks/useStores.ts`:
  - `useStores()` — queries all stores, queryKey `['stores']`
  - `useActiveStore()` — returns `data?.[0]` (single-store context; Store Switcher out of scope)
- [x] Add `src/hooks/__tests__/useStores.test.ts`:
  - Test: `useStores` returns the seeded Oxford Market Basket store
  - Test: `useActiveStore` returns the first store record

### Atoms
- [x] Create `src/components/atoms/StoreLogo.tsx`:
  - Props: `slug: string`, `name: string`
  - Renders `<img src={/store-logos/${slug}.png} alt={name} />`
  - Hides image on error via `onError` handler (sets display:none or removes from DOM via state)
- [x] Add `src/components/atoms/__tests__/StoreLogo.test.tsx`:
  - Test: renders img with correct `src` derived from slug
  - Test: img becomes hidden when error event fires

### Organisms
- [x] Create `src/components/organisms/StoreHeader.tsx`:
  - Calls `useActiveStore()`
  - While loading / no store: renders nothing (null)
  - When store is available: renders `<StoreLogo slug={store.slug} name={store.name} />`, store name (`font-display` bold), store address (`text-text-muted text-sm`)
  - Layout: `bg-primary px-4 py-2 flex items-center gap-3`

### Templates
- [x] Update `src/components/templates/AppShell.tsx`:
  - Add `<StoreHeader />` above `<main>` (inside the outer flex column)
  - Reduce `NAV_ITEMS` to 2: `Shop (/)` and `Settings (/settings)`. Remove Default List entry.
  - Remove `faClipboardList` import (no longer used)
  - Import `useLocation` from `react-router`. Derive `const isOnListDetail = location.pathname.startsWith('/lists/')`.
  - For the Shop NavLink's `className` callback, extend: `isActive || (to === '/' && isOnListDetail)` as the active condition. This ensures Shop tab is highlighted while shopping (since ShopRoute redirects to `/lists/:id`).
  - Note: `end: true` can remain on the Shop item since the custom override handles the `/lists/*` case.
- [x] Update `src/components/templates/__tests__/AppShell.test.tsx`:
  - Add `beforeEach(() => { globalThis.indexedDB = new IDBFactory(); vi.resetModules(); })` for clean DB state per test (same pattern as hook tests).
  - Swap `ShoppingListsRoute` index element for `ShopRoute` (must happen before deleting ShoppingListsRoute.tsx or the import will break).
  - Remove Default List route from test router setup; remove `DefaultListRoute` import.
  - Update assertions: expect exactly 2 nav links (Shop, Settings); remove all Default List assertions.
  - Add assertion: `StoreHeader` renders — wait for Oxford store name text (`Oxford Market Basket #62`). DB auto-seeds on open so no explicit data seeding needed.
  - Add assertion: Shop tab is active (has `text-accent`) when URL is `/lists/:id`.

### Routes
- [x] Create `src/routes/ShopRoute.tsx`:
  - Calls `useShoppingLists()` and `useCreateShoppingList()`
  - `useEffect`: when `!isPending && lists && lists.length > 0`, call `navigate('/lists/${lists[0].id}', { replace: true })`
  - While `isPending` or when lists exist (redirect imminent): render loading state (`text-text-muted "Loading…"`)
  - Empty state (isPending false, lists empty): "No lists yet. Tap + to start shopping." + FAB button (`fixed bottom-20 right-6 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center disabled:opacity-50`) that calls `mutateAsync()` then navigates
- [x] Add `src/routes/__tests__/ShopRoute.test.tsx`:
  - Test: shows loading state initially
  - Test: redirects to `/lists/:id` when lists exist (verify navigate was called with replace:true)
  - Test: shows empty state + create button when no lists exist
  - Test: create button calls mutation and navigates to new list

- [x] Update `src/routes/SettingsRoute.tsx`:
  - Import `useShoppingLists`, `useCreateShoppingList`, `ShoppingListCard`, `useNavigate`
  - Section "Your Lists": renders `ShoppingListCard` for each list; clicking navigates to `/lists/:id`
  - Empty state within section: "No lists yet."
  - "New list" FAB: `fixed bottom-20 right-6 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center disabled:opacity-50`
  - Section "Default List": simple row/link → `/default-list` (e.g., `<NavLink>` styled as a settings row)
  - No "Settings" heading needed — the nav tab already labels this screen
- [x] Add `src/routes/__tests__/SettingsRoute.test.tsx`:
  - Test: renders shopping list cards when lists exist
  - Test: renders empty state within Your Lists section when no lists
  - Test: clicking a list card navigates to `/lists/:id`
  - Test: Default List link/button is present

- [x] Update `src/App.tsx`:
  - Import `ShopRoute` from `@/routes/ShopRoute`
  - Change index route element from `<ShoppingListsRoute />` to `<ShopRoute />`
  - Remove `import ShoppingListsRoute`

- [x] Delete `src/routes/ShoppingListsRoute.tsx` (all functionality moved to SettingsRoute + ShopRoute)

### E2E
- [x] Update `e2e/navigation.spec.ts`:
  - Remove "Default List" tab tests (3 tests reference it)
  - Update the first test: only assert Shop and Settings links; no Default List link
  - Add test: navigating to `/` redirects to `/lists/:id` when a list exists
  - Add test: Shop tab link is active when URL is `/lists/:id` (since that's where Shop redirects)
- [x] Update `e2e/shopping-lists.spec.ts`:
  - "shows empty state on first visit": update to navigate to `/` and expect redirect to stay at `/` (empty state) OR update to navigate directly to `/settings` — adjust based on behavior
  - "FAB creates a new list": update — FAB now lives at `/` (empty state) and also at `/settings`; keep the `/` variant for "no lists" case, add a `/settings` variant
  - "clicking a list card": update to go to `/settings` to see the list card, then click
  - All tests that rely on `page.goBack()` to see the list: update to use `/settings` instead

---

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.

**Status**: Security review complete. No issues found. Ready for code review.

**Status**: Final checks passed (22/22 E2E, 78/78 unit tests). Fixed strict-mode locator collisions in E2E tests caused by aisle group headers/badges introduced by previous sprint. Reply 'wrap up' to finalize.
