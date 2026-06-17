# Claude Context

## Project Overview

Shoop is a personal progressive web app for managing a weekly grocery shopping list organized by store aisle. Built as a single-repository Vite + React PWA, designed for single-user, 100% offline-first use installed on a mobile device. All data is persisted locally via **IndexedDB** — there is no remote server or backend.

## Tech Stack

- **Build Tool:** Vite
- **UI Framework:** React 19
- **Routing:** React Router v7 (library mode)
- **Persistence:** TanStack Query v5 + IndexedDB (`idb`)
- **Ephemeral UI State:** Zustand (session-only state: active tabs, expanded aisles, etc.)
- **Styling:** Tailwind CSS v4
- **Component Model:** Atomic Design (Atoms → Molecules → Organisms → Templates)
- **Semantic Matching:** `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`) running in-browser via WASM
- **Unit/Integration Tests:** Vitest + React Testing Library
- **E2E Tests:** Playwright

> **No remote server.** This project does not use PocketBase, Supabase, or any backend API. All relational data maps to IndexedDB object stores. TanStack Query is the data-orchestration layer, reading/writing asynchronously to IndexedDB via a persistent storage adapter.

## Project Planning

- `PLAN.md` — read this first every session for current status and active task orientation.
- `tasks/active--*.md` — full implementation plan for the current task; execute against this when working on a feature.
- `tasks/complete--*.md` — completed task plans, saved for historical context.
- `tasks/backlog--*.md` — future tasks, one-liners only until promoted to active.

When a task completes:

- Remove it from `PLAN.md`.
- Rename the active task file to `tasks/complete--*.md`.
- Move to the next backlog item if directed.

## Architecture Decision Records

ADRs live in `docs/adrs/`. Before designing any solution that touches:

- State management strategy
- Data persistence or caching
- API/service layer patterns
- Component architecture boundaries
- Routing structure

…check for a relevant ADR first. If your implementation would contradict an ADR, surface it explicitly rather than silently deviating. If an ADR is outdated, flag it; don't silently ignore it.

**ADRs are immutable once accepted.** Never edit the body of an accepted ADR. If a decision changes:

1. Create a new ADR documenting the new decision.
2. Change the `Status` field of the old ADR to `Superseded by ADR-NNN` (the only permitted edit to an accepted ADR).

When writing a plan (Step 1 of Workflow Requirements), cite any ADRs that constrain the design.

## Workflow Requirements

1. **Plan Before Action:** Before writing any code, generate a full implementation plan and save it to `tasks/active--<feature-name>.md`. Do not begin implementation until the plan file exists.
2. **Type Safety:** Ensure every component and utility has strict TypeScript definitions. Prefer interfaces over types for public APIs.
3. **Atomic Design:** Follow the folder hierarchy in `src/components/` strictly:
    - **Atoms:** Smallest units (Button, Checkbox, Input, Badge, Icon). No business logic.
    - **Molecules:** Groups of atoms (GroceryItem, AisleGroup, SearchBar). No direct store access.
    - **Organisms:** Complex UI blocks (DefaultListEditor, WeeklyListBuilder, ShoppingView, AddItemForm). Can interact with stores and hooks.
    - **Templates:** Page layouts/wireframes (AppShell).
4. **State Management:** Do not create a single monolithic store. Zustand is for ephemeral/session UI state only. All persistent data goes through TanStack Query hooks backed by IndexedDB.

## Directory Structure

```
src/
  components/
    atoms/                    # Button, Checkbox, Input, Badge, Icon
    molecules/                # GroceryItem, AisleGroup, SearchBar
    organisms/                # DefaultListEditor, WeeklyListBuilder, ShoppingView, AddItemForm
    templates/                # AppShell
  routes/                     # React Router v7 route components
  db/                         # IndexedDB initialization, migration logic, and schemas
    idbClient.ts
    schema.ts
  hooks/                      # TanStack Query custom hooks wrapping IndexedDB queries
    useStores.ts
    useLists.ts
    useAisleMatcher.ts        # Loads and memoizes the HuggingFace WASM model
  stores/                     # Ephemeral UI Zustand slices
    useUIStore.ts
  services/                   # Local utility services (e.g., embedding classifier)
    classifier.ts
  assets/
    aisles/                   # Static store layout JSON files (e.g., oxford-62.json)
public/
  manifest.json
  service-worker.js
docs/
  adrs/                       # Architecture Decision Records
  prd/                        # Product Requirements Documents
e2e/                          # Playwright end-to-end tests
```

## Data Model (IndexedDB Object Stores)

```
stores        — id (string, PK), name, address, slug
aisles        — id (string, PK), store_id (Index), number, label, sort_order
items         — id (string, PK), name, canonical_name, aisle_id (Index), store_id (Index)
default_list  — id (string, PK), item_id, quantity, unit, notes
weekly_list   — id (string, PK), week_start, item_id, quantity, checked, added_from_default
```

Canonical TypeScript interfaces for these shapes live in `src/db/schema.ts`.

## Interaction Patterns

- If a task is ambiguous, ask for clarification before proceeding.
- When editing components, check if existing **Atoms** can be reused before creating new ones.
- Maintain separation of concerns: all IndexedDB logic lives in `db/` and `hooks/`. Never write inline IndexedDB queries inside UI components.
- No relative imports. Use path-aliased imports (e.g., `@/components/atoms/Button`, `@/db/idbClient`).
- No barrel files.

## Data & Service Layer

The IndexedDB client is initialized once in `db/idbClient.ts` and imported by all custom hooks. Collection-specific query logic lives in `hooks/` (e.g., `useStores.ts`, `useLists.ts`). TanStack Query hooks are the only place query keys, caching config, and optimistic updates are defined.

The HuggingFace WASM model is loaded and memoized in `hooks/useAisleMatcher.ts`. It is only consumed by the `AddItemForm` organism; no other component imports it directly.

## Key Constraints

- **`.env.local`** — never commit; only `.env.example` with empty values goes in the repo.
- Ask before making any changes to `package.json` or `package-lock.json`.
- Use npm/npx. Do not use pnpm.
- The app must remain fully functional offline. Optimistic updates and TanStack Query's mutation queue are the mechanism for the shopping flow; do not introduce patterns that require a network connection in the critical path of checking off items.

## Helpful Scripts

| Goal                                        | Command                |
| ------------------------------------------- | ---------------------- |
| **Typecheck + lint + unit test (one shot)** | `npm run validate`     |
| Dev environment                             | `npm run dev`          |
| Production build                            | `npm run build`        |
| Typecheck entire project                    | `npm run typecheck`    |
| Lint entire project                         | `npm run lint`         |
| Unit tests                                  | `npm run test`         |
| Playwright E2E                              | `npm run test:e2e`     |
| Check formatting                            | `npm run format:check` |

> **`npm run validate` is NOT end-to-end.** It runs typecheck + lint + Vitest only. It does **not** run the Playwright E2E suite. Changes that touch UI, routes, or offline/gesture interaction can pass `validate` while breaking E2E. Run `test:e2e` locally to confirm. A change is not "done" while CI is red.
