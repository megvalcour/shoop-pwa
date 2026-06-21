---
status: complete
class: standard
e2e_required: true
clarifications: |
  Scope = add a read-only "Your Stores" section to Settings that lists every
  store, and a per-store detail view (/stores/:id) showing the store's name,
  address, logo, and its aisles/sections.
  UI fidelity: each store entry mirrors the existing "Manage default items"
  CTA row (bg-surface, rounded-xl, label + chevron). Each aisle/section in the
  detail view mirrors the existing list/item card entries (bg-card, rounded-lg,
  shadow-sm row).
  Read-only: no creating/editing/deleting stores or aisles in this task — the
  store + aisle catalog is seeded and currently single-store.
  Out of scope: switching the active store (StoreHeader's StoreSwitcherSheet
  already owns that), editing aisle order/labels, adding stores.
---

# Task: "Your Stores" settings section + store detail view

## Problem

Settings exposes "Your Lists", "Default List", and "Danger Zone", but there is
no way to view the configured stores or inspect a store's aisle layout. The data
already exists (`stores` + `aisles` object stores, both seeded), and read hooks
already exist (`useStores`, `useAisles(storeId)`) — only the UI surface is
missing.

### Current state (already implemented)

- `src/hooks/useStores.ts` → `useStores()` returns `db.getAll('stores')`;
  `useActiveStore()` returns `stores[0]`. **No change needed.**
- `src/hooks/useAisles.ts` → `useAisles(storeId)` returns that store's aisles
  sorted by `sort_order` (falls back to all aisles when `storeId` is omitted).
  **No change needed.**
- `src/components/atoms/StoreLogo.tsx` already renders `/store-logos/{slug}.png`
  with a graceful `onError` hide. Reuse as-is (it is sized `h-9 w-9`; the detail
  header will want a larger variant — see Approach).
- `src/routes/SettingsRoute.tsx` renders the "Manage default items" CTA as an
  inline `NavLink`: `flex items-center justify-between px-4 py-3 bg-surface
  rounded-xl text-text` with a `faChevronRight`. This is the row idiom to mirror.
- List/item cards (`ShoppingListCard`, `GroceryListItem`) use
  `px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between`.
  This is the card idiom the aisle rows must mirror.
- `AisleGroup` formats an aisle header as `Aisle ${number} — ${label}` when a
  `number` is present, else just `label` (special sections have an empty
  `number`). The detail view reuses this label convention.
- Routes are nested under `AppShell` in `src/App.tsx`; `AppShell` keeps the Shop
  tab visually active on `/lists/:id` via `location.pathname.startsWith('/lists/')`.

## Relevant ADRs

- **ADR-0012** (Shop-as-root redirect navigation): Settings is the canonical home
  for secondary management surfaces; adding a `/stores/:id` sub-view reached from
  Settings is consistent. The new route nests under `AppShell` so the persistent
  `StoreHeader` + bottom nav remain. To match the existing `/lists/:id` behavior,
  `AppShell` is extended to keep the **Settings** tab active on `/stores/:id`
  (mirrors the existing `isOnListDetail` treatment for Shop). No deviation.
- **ADR-0005** (atomic design): new presentational pieces are molecules
  (`StoreListEntry`, `AisleCard`) with no store/hook access; the data-fetching
  lives in the new **route** (and reuses existing organisms/atoms). `StoreLogo`
  atom is reused. No deviation.
- **ADR-0008** (design tokens): all styling uses existing tokens
  (`bg-surface`, `bg-card`, `text-text`, `text-text-muted`, `text-primary`,
  `rounded-xl`, `rounded-lg`, `shadow-sm`). No new tokens.

No ADR is contradicted. **No new ADR required** — this is a read-only view that
introduces no new data model, persistence pattern, or service boundary. The new
route mirrors the accepted `/lists/:id` nested-route pattern.

## Approach

Read-only feature: one new route, two presentational molecules, a Settings
section, and a one-line `AppShell` active-tab tweak. Zero data-layer change.

### 1. New molecule — `src/components/molecules/StoreListEntry.tsx`

Presentational row for the "Your Stores" list, structurally identical to the
"Manage default items" CTA so the two read as one family.

- Props (interface, strict types):
  - `store: Store`
  - `onClick: () => void`
- Markup: a `<button type="button">` with
  `flex items-center justify-between px-4 py-3 bg-surface rounded-xl text-text
  w-full text-left active:opacity-70`, `aria-label={store.name}`.
  - Left cluster: `StoreLogo` (`slug`, `name`) + a column with the store `name`
    (`font-medium`) and `address` (`text-sm text-text-muted truncate`).
  - Right: `faChevronRight` in `text-text-muted text-sm` (matches the CTA).
- No store/hook access (molecule rule).

### 2. New molecule — `src/components/molecules/AisleCard.tsx`

Presentational card for a single aisle/section, mirroring the list/item card row.

- Props (interface, strict types):
  - `aisle: Aisle`
- Markup: `px-4 py-3 bg-card rounded-lg shadow-sm flex items-center
  justify-between`.
  - Left: aisle `label` (`font-medium text-text truncate`).
  - Right: when `aisle.number` is non-empty, a `Badge` reading `Aisle
    {number}`; when empty (special section), render nothing on the right (or a
    muted "Section" label) so special sections still read cleanly.
- Reuses the `Badge` atom for the aisle-number chip (consistent with how
  `GroceryListItem` shows aisle info as a Badge).

### 3. New route — `src/routes/StoreDetailRoute.tsx`

Pattern mirrors `ShoppingListDetailRoute` (fetch collection, `.find` the record,
handle pending/error/not-found).

- `const { id } = useParams<{ id: string }>()`.
- `const { data: stores, isPending, isError } = useStores()` and
  `const store = stores?.find((s) => s.id === id)`.
- `const { data: aisles, isPending: aislesPending } = useAisles(id)` (the hook
  takes the store id directly).
- States:
  - no `id` / not found / load error → centered "Store not found." (matches
    `ShoppingListDetailRoute` copy style).
  - pending → centered "Loading…".
- Body (`flex flex-col px-4 py-4 pb-24`):
  - **Header block**: `StoreLogo` rendered larger (see note below) + `name`
    (`font-display font-bold text-text text-xl`) + `address`
    (`text-text-muted text-sm`). Layout mirrors `StoreHeader`'s logo+name+address
    cluster but without the switcher button.
  - **Aisles section**: `h2` "Aisles" (`font-display font-bold text-text text-lg
    mb-3`), then a `flex flex-col gap-3` list of `AisleCard`s mapped from
    `aisles`. Empty/pending states: "Loading…" / "No aisles for this store yet."

  **StoreLogo sizing note:** `StoreLogo` is currently hard-coded to `h-9 w-9`.
  Add an optional `className`/`size` prop (default preserves current `h-9 w-9`
  so `StoreHeader` is unaffected) and pass a larger value (e.g. `h-16 w-16`) in
  the detail header. This is the only atom change and is backward-compatible.

### 4. `src/routes/SettingsRoute.tsx` — add "Your Stores" section

- Import `useStores` and `StoreListEntry`.
- `const { data: stores, isPending: storesPending, isError: storesError } = useStores()`.
- Insert a new `<section className="px-4 pt-6">` (placed after "Your Lists",
  before "Default List" — stores are a top-level concept):
  - `h2` "Your Stores".
  - Loading / error / empty states consistent with `renderListsContent`.
  - `flex flex-col gap-3` of `StoreListEntry` per store, each
    `onClick={() => navigate(`/stores/${store.id}`)}`.

### 5. `src/App.tsx` — register the route

- Add `{ path: 'stores/:id', element: <StoreDetailRoute /> }` to the `AppShell`
  children, alongside `lists/:id` and `default-list`.

### 6. `src/components/templates/AppShell.tsx` — keep Settings active on detail

- Add `const isOnStoreDetail = location.pathname.startsWith('/stores/');` and OR
  it into the Settings NavLink's active styling (mirroring the existing
  `to === '/' && isOnListDetail` treatment for Shop), so the Settings tab stays
  highlighted while viewing a store.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/StoreListEntry.tsx` | **New** CTA-style store row (logo + name + address + chevron). |
| `src/components/molecules/AisleCard.tsx` | **New** card-style aisle/section row (label + aisle-number Badge). |
| `src/routes/StoreDetailRoute.tsx` | **New** route: store header (logo/name/address) + aisle list. |
| `src/components/atoms/StoreLogo.tsx` | Add optional size/className prop; default unchanged. |
| `src/routes/SettingsRoute.tsx` | Add "Your Stores" section listing `StoreListEntry`s. |
| `src/App.tsx` | Register `stores/:id` route under `AppShell`. |
| `src/components/templates/AppShell.tsx` | Keep Settings tab active on `/stores/:id`. |
| `src/hooks/useStores.ts`, `src/hooks/useAisles.ts` | **No change** (already sufficient). |

## Implementation checklist

- [x] Create `src/components/molecules/StoreListEntry.tsx`.
- [x] Create `src/components/molecules/AisleCard.tsx`.
- [x] Add optional size prop to `src/components/atoms/StoreLogo.tsx` (default unchanged).
- [x] Create `src/routes/StoreDetailRoute.tsx`.
- [x] Add "Your Stores" section to `src/routes/SettingsRoute.tsx`.
- [x] Register `stores/:id` in `src/App.tsx`.
- [x] Extend `src/components/templates/AppShell.tsx` Settings active-state.
- [x] Unit tests (see below).
- [x] E2E flow (see below).
- [x] `npm run validate` clean.
- [x] `npm run test:e2e` green.

## Tests

### Unit / integration (Vitest + RTL)

- **`StoreListEntry.test.tsx`** (new): renders store name + address; clicking the
  row calls `onClick`; renders a chevron.
- **`AisleCard.test.tsx`** (new): renders the aisle label; renders an "Aisle N"
  Badge when `number` is set; renders no number chip for a special section
  (empty `number`).
- **`StoreLogo.test.tsx`** (extend): default size class still applied; custom
  size prop overrides it.
- **`StoreDetailRoute`** — add `src/routes/__tests__/StoreDetailRoute.test.tsx`
  (new), rendering via `createMemoryRouter` against fake-indexeddb seeded with a
  store + aisles: shows name/address, lists aisle cards in `sort_order`, and
  renders "Store not found." for an unknown id.
- **`SettingsRoute.test.tsx`** (extend): "Your Stores" section renders an entry
  per seeded store; clicking an entry navigates to `/stores/:id` (assert via a
  stub route element, matching the existing `/lists/:id` test pattern).
- **`AppShell.test.tsx`** (extend): Settings tab is active when the path is
  `/stores/:id`.

### E2E (Playwright) — new `e2e/your-stores.spec.ts`

- From Settings, the "Your Stores" section lists the seeded store; tap it →
  store detail shows the name, address, and at least one aisle card; the Settings
  tab remains highlighted. Use a back navigation to confirm return to Settings.

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — Your Stores flow green.

## Out of scope

- Creating, editing, renaming, reordering, or deleting stores or aisles.
- Switching the active store (already owned by `StoreHeader` /
  `StoreSwitcherSheet`).
- Showing items within each aisle on the detail view (aisles/sections only).
- Any change to the data model, schema, or the `useStores`/`useAisles` hooks.
