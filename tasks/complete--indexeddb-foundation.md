---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: false
code_review_level: medium
clarifications: |
  ID format: crypto.randomUUID()
  Seed scope: Aisles + items (182 items pre-populated from docs/prd/market-basket-62-oxford.json)
  e2e_required: false (pure data layer, no UI or routes)
---

# Slice 1 — IndexedDB Foundation

## Relevant ADRs

- **ADR-0002** — IndexedDB via `idb` is the sole persistence layer. Object stores defined in `schema.ts`, migration logic in `idbClient.ts`. _(Directly governs this slice.)_

## Overview

Bootstrap the entire data layer: TypeScript schema interfaces, `idb`-powered database initialization with versioned migrations, Oxford Market Basket #62 seed data (store + aisles + 182 items), and unit tests verifying migration correctness and seed idempotency. Also sets up Vitest, `fake-indexeddb`, the `@/` path alias, and the `validate` / `test` / `typecheck` / `format:check` npm scripts needed by all future slices.

---

## Prerequisites — Package Additions

The following packages are not yet in `package.json`. Per CLAUDE.md convention, **these require explicit user approval before `npm install` runs** (Step 0.1 below).

| Package | Type | Reason |
|---|---|---|
| `idb` | production | IndexedDB Promise wrapper (ADR-0002) |
| `vitest` | dev | Test runner |
| `@vitest/coverage-v8` | dev | Coverage reporting |
| `fake-indexeddb` | dev | In-memory IDB implementation for Vitest |
| `happy-dom` | dev | Browser-like environment for Vitest |
| `prettier` | dev | Code formatting (`format:check` script from CLAUDE.md) |

---

## Implementation Checklist

### 0 — Approval gates

- [ ] **0.1** Present the package list above to the user and wait for explicit approval before running `npm install`. Do not proceed to 0.2 without it.
- [ ] **0.2** Install approved packages:
  ```
  npm install idb
  npm install -D vitest @vitest/coverage-v8 fake-indexeddb happy-dom prettier
  ```

### 1 — Tooling configuration

- [ ] **1.1** Add scripts to `package.json`:
  - `"typecheck": "tsc -p tsconfig.app.json --noEmit"`
  - `"test": "vitest run"`
  - `"validate": "npm run typecheck && npm run lint && npm run test"`
  - `"format:check": "prettier --check \"src/**/*.{ts,tsx}\""`
- [ ] **1.2** Add `@/` path alias to `vite.config.ts`:
  ```ts
  import path from 'node:path';
  resolve: { alias: { '@': path.resolve(__dirname, './src') } }
  ```
- [ ] **1.3** Add `paths`, `baseUrl`, and `resolveJsonModule` to `tsconfig.app.json`:
  ```json
  "baseUrl": ".",
  "paths": { "@/*": ["./src/*"] },
  "resolveJsonModule": true
  ```
  `resolveJsonModule` is required for `tsc --noEmit` to resolve JSON imports without errors.
- [ ] **1.4** Add Vitest config block to `vite.config.ts`:
  ```ts
  test: {
    environment: 'happy-dom',
    include: ['src/**/__tests__/**/*.test.ts?(x)'],
  }
  ```
  Import `defineConfig` from `vitest/config` instead of `vite` so Vitest's `test` field is recognized.
- [ ] **1.5** Create `.prettierrc` at project root with defaults:
  ```json
  { "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
  ```

### 2 — Schema

- [ ] **2.1** Create `src/db/schema.ts` with the following exports:
  - `DB_NAME = 'shoop'`, `DB_VERSION = 1` constants
  - `interface Store { id: string; name: string; address: string; slug: string; }`
  - `interface Aisle { id: string; store_id: string; number: string; label: string; sort_order: number; }`
    - `number` is a string to accommodate both numeric aisles ("1"–"21") and named sections ("Produce Dept", "Meat Dept", etc.)
  - `interface Item { id: string; name: string; canonical_name: string; aisle_id: string; store_id: string; }`
  - `interface DefaultListEntry { id: string; item_id: string; quantity: number; unit: string; notes: string; }`
  - `interface WeeklyListEntry { id: string; week_start: string; item_id: string; quantity: number; checked: boolean; added_from_default: boolean; }`
  - `interface ShoopDB extends DBSchema` — typed schema for all 5 stores (used by `openDB<ShoopDB>`). Each store must follow the `idb` shape:
    ```ts
    {
      stores:       { key: string; value: Store; indexes: Record<never, never> };
      aisles:       { key: string; value: Aisle; indexes: { 'store_id': string } };
      items:        { key: string; value: Item; indexes: { 'aisle_id': string; 'store_id': string } };
      default_list: { key: string; value: DefaultListEntry; indexes: Record<never, never> };
      weekly_list:  { key: string; value: WeeklyListEntry; indexes: Record<never, never> };
    }
    ```

### 3 — Seed data

- [ ] **3.1** Create `src/assets/aisles/oxford-62.json` by transforming `docs/prd/market-basket-62-oxford.json`:
  - One `store` object: `{ id, name: "Oxford Market Basket #62", address: "95 Sutton Avenue, Oxford, MA 01540", slug: "oxford-62" }`
  - 31 `aisles` objects: numeric aisles 1–21 (with derived labels, e.g. Aisle 1 → "Dairy & Eggs") + 10 named sections (Produce Dept sort_order 0, aisles 1–21 sort_order 1–21, named sections sort_order 22–30). Aisle labels for numeric aisles derived from item categories in the PRD JSON.
  - 182 `items` objects with generated `id`s and `aisle_id` foreign keys pointing to the aisles above.
  - Normalize dual-location and alias values:
    - `"19 & 20"` → aisle 19
    - `"10 & Checkout"` → aisle 10
    - `"Back Main"` → Back Main Aisle (sort_order 28)
    - `"Back Main Aisle"` → Back Main Aisle (sort_order 28) — both values exist in the PRD JSON and must map to the same aisle record
    - `"Front Corner"` → Front Corner (Bakery) (sort_order 24)
  - Aisle `number` field: use the original string from the JSON ("1", "2", ..., "Produce Dept", "Deli/Fish Dept", etc.)

  Named section sort orders:
  | Section | sort_order |
  |---|---|
  | Produce Dept | 0 |
  | Aisles 1–21 | 1–21 |
  | Deli/Fish Dept | 22 |
  | Meat Dept | 23 |
  | Front Corner (Bakery) | 24 |
  | Cheese Case | 25 |
  | Freezer Wall | 26 |
  | Freezer | 27 |
  | Back Main Aisle | 28 |
  | Market's Kitchen | 29 |
  | Registers | 30 |

### 4 — IndexedDB client

- [ ] **4.1** Create `src/db/idbClient.ts`:
  - Import `openDB, DBSchema, IDBPDatabase` from `idb`
  - Import `ShoopDB, DB_NAME, DB_VERSION` from `@/db/schema`
  - Import seed JSON from `@/assets/aisles/oxford-62.json` — plain import, no `assert`/`with` needed (Vite resolves JSON natively; `resolveJsonModule` handles tsc):
    ```ts
    import seedData from '@/assets/aisles/oxford-62.json';
    ```
  - Define `upgrade(db)` function: `createObjectStore` for all 5 stores with `keyPath: 'id'`; `createIndex('store_id', 'store_id')` on `aisles`; `createIndex('aisle_id', 'aisle_id')` and `createIndex('store_id', 'store_id')` on `items`
  - Define `async function seedDatabase(db: IDBPDatabase<ShoopDB>)`: check `(await db.count('stores')) === 0` before seeding; insert store, then aisles, then items in separate `readwrite` transactions
  - Export `const dbPromise: Promise<IDBPDatabase<ShoopDB>> = openDB<ShoopDB>(DB_NAME, DB_VERSION, { upgrade }).then(db => seedDatabase(db).then(() => db))`

### 5 — Unit tests

- [ ] **5.1** Create `src/db/__tests__/idbClient.test.ts`:
  - `import 'fake-indexeddb/auto'` at top of file to install mock IDB globals before the module loads
  - Re-import `dbPromise` fresh each test by using `vi.resetModules()` in `beforeEach` to avoid singleton bleeding between tests
  - **Test 1 — Migration**: `db.objectStoreNames` contains `['stores', 'aisles', 'items', 'default_list', 'weekly_list']`
  - **Test 2 — Seed counts**: `db.count('stores') === 1`, `db.count('aisles') === 31`, `db.count('items') === <exact count from JSON>`; store record has `name === 'Oxford Market Basket #62'`
  - **Test 3 — Idempotency**: within a single test (no `vi.resetModules()` between the two opens), call `dbPromise` a second time using the same module instance and fake-IDB environment; counts must remain unchanged
  - **Test 4 — Index queries**: `db.getAllFromIndex('aisles', 'store_id', storeId).length === 31`; `db.getAllFromIndex('items', 'store_id', storeId).length === <item count>`

### 6 — Validation

- [ ] **6.1** Run `npm run validate` (typecheck + lint + test). Fix all errors before marking complete.

---

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.

**Status**: Security review done. No issues found. Ready for code review.

**Code Review (medium)**: 5 findings fixed — partial seed atomicity (single multi-store transaction), upgrade oldVersion guard, fake-indexeddb test isolation, idempotency test correctness, test.include glob broadened. All tests pass. Ready for final checks.

**Status**: Final checks passed. Ready to wrap up.
