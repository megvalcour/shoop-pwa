---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: true
code_review_level: medium
clarifications: |
  Route path: stays at /
  Nav label: Shop
  Migration strategy: delete weekly_list in v2 (clean break)
  PRD update: include in this task
---

# On-Demand Shopping Lists — Codebase Migration

## Relevant ADRs

- **ADR-0002** — IndexedDB is sole persistence; upgrade cases are append-only (`if (oldVersion < N)`; never rewrite existing cases)
- **ADR-0004** — Zustand for ephemeral UI state only; all persistent data via TanStack Query + IndexedDB hooks

## Scope

Rename and reshape every "weekly list" concept in the codebase to the on-demand "shopping lists" model agreed on in the updated backlog. No new UI is built here — this is a pure rename + data model migration task. The route stays at `/`.

**Out of scope:** implementing the shopping lists index screen, `useShoppingLists` hook, `ShoppingListBuilder` organism, or any new UI — those are backlog items that follow.

---

## Checklist

### 1. Schema (`src/db/schema.ts`)

- [x] Remove `WeeklyListEntry` interface
- [x] Add `ShoppingList` interface: `{ id: string; name: string; created_at: string }`
- [x] Add `ListItem` interface: `{ id: string; list_id: string; item_id: string; quantity: number; checked: boolean; added_from_default: boolean }`
- [x] Replace `weekly_list` store in `ShoopDB` with `shopping_lists: { key: string; value: ShoppingList; indexes: Record<never, never> }` and `list_items: { key: string; value: ListItem; indexes: { list_id: string } }`
- [x] Bump `DB_VERSION` from `1` to `2`

### 2. DB client (`src/db/idbClient.ts`)

- [x] In the `if (oldVersion < 1)` block, cast the `weekly_list` `createObjectStore` call to `(db as unknown as IDBDatabase)` — required because `weekly_list` is no longer in the typed `ShoopDB` schema but the v1 migration must remain unchanged per ADR-0002
- [x] Add `if (oldVersion < 2)` block:
  - `(db as unknown as IDBDatabase).deleteObjectStore('weekly_list')`
  - `db.createObjectStore('shopping_lists', { keyPath: 'id' })`
  - `const listItems = db.createObjectStore('list_items', { keyPath: 'id' })`
  - `listItems.createIndex('list_id', 'list_id')`

### 3. DB tests (`src/db/__tests__/idbClient.test.ts`)

- [x] Update the `'creates all object stores on migration'` test: replace `'weekly_list'` with `'list_items'` and `'shopping_lists'` in the expected sorted array

### 4. Route rename

- [x] Rename `src/routes/WeeklyRoute.tsx` → `src/routes/ShoppingListsRoute.tsx`
- [x] Rename the exported function from `WeeklyRoute` to `ShoppingListsRoute`
- [x] Update the heading text from `"Weekly List"` to `"Lists"` and the subtext to `"Your shopping lists will appear here."`

### 5. App router (`src/App.tsx`)

- [x] Update import: `WeeklyRoute` → `ShoppingListsRoute` from `@/routes/ShoppingListsRoute`
- [x] Update the route's `element` prop to `<ShoppingListsRoute />`

### 6. AppShell nav (`src/components/templates/AppShell.tsx`)

- [x] Change `label: 'Weekly'` → `label: 'Shop'` in `NAV_ITEMS`

### 7. AppShell unit tests (`src/components/templates/__tests__/AppShell.test.tsx`)

- [x] Update import: `WeeklyRoute` → `ShoppingListsRoute` from `@/routes/ShoppingListsRoute`
- [x] Update route child element: `<WeeklyRoute />` → `<ShoppingListsRoute />`
- [x] Replace all six occurrences of `'Weekly'` / `/Weekly/` in test assertions and descriptions with `'Shop'` / `/Shop/` as appropriate: `getByText('Weekly')` (line 31), two test descriptions containing "Weekly" (lines 36, 42), and three `/Weekly/` role name regexes (lines 38, 47, 53)

### 8. E2E tests (`e2e/navigation.spec.ts`)

- [x] Replace all six occurrences of `/weekly/i` `getByRole` name matchers with `/shop/i` (lines 6, 20, 28, 33, 35, 41)
- [x] Rename `const weeklyLink` variable (line 6) to `shopLink` and update both usages of it (lines 6, 10)
- [x] Update test description `'/ — Weekly tab is active, others are not'` → `'/ — Shop tab is active, others are not'`
- [x] Update test description `'clicking Weekly tab from Settings returns to / and activates Weekly'` → `'clicking Shop tab from Settings returns to / and activates Shop'`

### 9. CLAUDE.md data model section

- [x] In the **Data Model** section, replace the `weekly_list` row with two rows:
  ```
  shopping_lists — id (string, PK), name, created_at
  list_items     — id (string, PK), list_id (Index), item_id, quantity, checked, added_from_default
  ```
- [x] In the **Directory Structure** `hooks/` entry, rename `useLists.ts` comment from any weekly reference if present
- [x] Scan for any remaining "weekly" references in CLAUDE.md and update (e.g. `WeeklyListBuilder` in organisms description → `ShoppingListBuilder`)

### 10. PRD (`docs/prd/high-level-plan.md`)

- [x] Update the **Data Model** section: replace `weekly_list` row with `shopping_lists` + `list_items` rows (remove `week_start`)
- [x] Update the **Weekly List Builder** feature section heading and body to "Shopping Lists" / on-demand model language
- [x] Scan for any remaining "weekly" in the doc and update

### 11. Validate

- [x] Run `npm run validate` — resolve all TypeScript, lint, and Vitest failures before proceeding
- [x] Run `npm run test:e2e` — all five nav spec tests must pass with the new "Shop" label

**Review**: Approved by fresh session. Ready to implement.

**Status**: Validation passed. Ready for security review.

**Status**: Security review passed. No issues found. Ready for code review.

**Code Review (medium)**: Two findings — CONFIRMED: missing v1→v2 upgrade test; PLAUSIBLE: v1 migration block modified. Both fixed: upgrade test added to `idbClient.test.ts`, explanatory comment added to v1 cast in `idbClient.ts`. All 9 tests pass. Ready for final checks.
