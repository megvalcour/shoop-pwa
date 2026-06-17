# Claude Context

## Project Overview

This is grocery PWA — a personal progressive web app for managing a weekly grocery shopping list organized by store aisle. Built with a React/Vite PWA frontend with data persisted to IndexDB in the browser. Designed for single-user, offline-capable use installed on a mobile device.

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, React Router v7 (library mode).
- **Backend:** None; IndexDB to store on device
- **State Management:** Zustand
- **Semantic Matching:** Transformers.js (`Xenova/all-MiniLM-L6-v2`) running in-browser via WASM for aisle suggestions.
- **Testing:** Vitest, React Testing Library, Playwright for E2E.

<!-- ## Project Planning

- `PLAN.md` — read this first every session for current status and active task orientation.
- `tasks/active--*.md` — full implementation plan for the current task; execute against this when working on a feature.
- `tasks/complete--*.md` — full implementation plan for completed tasks; saved for historical context.
- `tasks/backlog--*.md` — future tasks, one-liners only until promoted to active.

When a task completes:

- Summarize it in one line under Last Completed in `PLAN.md`; remove the previous entry, if any.
- Rename active task file to `tasks/complete--*.md`.
- Move to the next backlog item if directed. -->

## Architecture Decision Records

ADRs live in `docs/adr/`. Before designing any solution that touches:

- State management strategy
- Auth or session handling
- API/service layer patterns
- Component architecture boundaries
- Data fetching and caching

…check for a relevant ADR first. If your implementation would contradict an ADR, surface it explicitly rather than silently deviating. If an ADR is outdated, flag it; don't silently ignore it.

**ADRs are immutable once accepted.** Never edit the body of an accepted ADR. If a decision changes:

1. Create a new ADR documenting the new decision.
2. Change the `Status` field of the old ADR to `Superseded by ADR-NNN` (the only permitted edit to an accepted ADR).

When writing a plan (Step 1 of Workflow Requirements), cite any ADRs that constrain the design.

## Workflow Requirements

1. **Plan Before Action:** Before writing any code, generate a full implementation plan and save it to `tasks/active--<feature-name>.md`. Do not begin implementation until the plan file exists.
2. **Always Use Context7 MCP:** Leverage the Context7 MCP tool whenever code depends on library-specific implementation details.
3. **Type Safety:** Ensure every component and utility has strict TypeScript definitions. Prefer interfaces over types for public APIs.
4. **Atomic Design:** Follow the folder hierarchy in `apps/web-app/src/components/` strictly:
    - **Atoms:** Smallest units (Button, Checkbox, Input, Badge, Icon). No business logic.
    - **Molecules:** Groups of atoms (GroceryItem, AisleGroup, SearchBar). No direct store access.
    - **Organisms:** Complex UI blocks (DefaultListEditor, WeeklyListBuilder, ShoppingView, AddItemForm). Can interact with stores and hooks.
    - **Templates:** Page layouts/wireframes (AppShell).
5. **State Management:** Do not create a single monolithic store. Use domain slices in `src/stores/` (e.g., `useUIStore`, `useListStore`).

## Directory Structure

```
apps/web-app/
  e2e/                        # Playwright E2E tests
  src/
    components/
      atoms/                  # Button, Checkbox, Input, Badge, Icon
      molecules/              # GroceryItem, AisleGroup, SearchBar
      organisms/              # DefaultListEditor, WeeklyListBuilder,
                              # ShoppingView, AddItemForm
      templates/              # AppShell
    routes/                   # React Router v7 route components
    services/                 # PocketBase client and all external API logic
    stores/                   # Domain-scoped Zustand slices
    hooks/                    # TanStack Query hooks wrapping services/
  public/
    manifest.json
    service-worker.js

packages/
  shared-types/               # Shared TypeScript interfaces (mirrors PocketBase schema)
  aisle-data/                 # Store aisle JSON files (e.g. oxford-62.json)

pocketbase/
  pb_migrations/              # PocketBase migration files
  pb_hooks/                   # Optional JS hooks for server-side logic

docs/
  adr/                        # Architecture Decision Records
  prd/                        # Product Requirements Documents
```

## Interaction Patterns

- If a task is ambiguous, ask for clarification before proceeding.
- When editing components, check if existing **Atoms** can be reused before creating new ones.
- Maintain separation of concerns: Keep all PocketBase logic in `services/` or `hooks/`, never directly in UI components.
- No relative imports. Use path-aliased imports (e.g., `@/components/atoms/Button`, `@/services/pocketbase`).
- No barrel files.

## Service Layer

The PocketBase client is instantiated once in `services/pocketbase.ts` and imported by all other service modules. Collection-specific logic lives in its own service file (e.g., `services/items.ts`, `services/weeklyList.ts`). TanStack Query hooks in `hooks/` wrap these service calls — they are the only place query keys, caching config, and optimistic updates are defined.

The Transformers.js WASM model is loaded and memoized in `hooks/useAisleMatcher.ts`. It is only consumed by the AddItemForm organism; no other component imports it directly.

## Data Model

PocketBase collections mirror these shapes (canonical TypeScript interfaces live in `packages/shared-types/`):

```
stores        — id, name, address, slug
aisles        — id, store_id, number, label, sort_order
items         — id, name, canonical_name, aisle_id, store_id
default_list  — id, item_id, quantity, unit, notes
weekly_list   — id, week_start, item_id, quantity, checked, added_from_default
```

Never write PocketBase collection rules without verifying access is correctly restricted in the admin UI. Collection rules are the PocketBase equivalent of RLS — treat them with the same care.

## Helpful Scripts

Run these from the repo root. They delegate to Turborepo and run across every workspace package in parallel.

| Goal                                        | Command                                       |
| ------------------------------------------- | --------------------------------------------- |
| **Typecheck + lint + unit test (one shot)** | `npm run validate`                            |
| **Fast feedback (no tests)**                | `npm run typecheck && npm run lint`           |
| Typecheck entire repo                       | `npm run typecheck`                           |
| Lint entire repo                            | `npm run lint`                                |
| Test entire repo (unit)                     | `npm run test`                                |
| Tests for changed files only                | `cd apps/web-app && npx vitest run --changed` |
| Tests for one file                          | `cd apps/web-app && npx vitest run <path>`    |
| Playwright E2E (requires PocketBase)        | `npm run pb:start` then `npm run test:e2e`    |
| Check formatting                            | `npm run format:check`                        |
| PocketBase local (start / stop)             | `npm run pb:start` / `npm run pb:stop`        |

When asked to typecheck, lint, or test the project/repo, always run the corresponding root-level `npm run` command above rather than running scripts inside individual packages.

> **`npm run validate` is NOT end-to-end.** It runs typecheck + lint + Vitest only. It does **not** run the Playwright E2E suite (`test:e2e`), which requires a running PocketBase instance. A change that touches UI, routes, or offline/gesture interaction can pass `validate` while breaking E2E. For those changes, run `test:e2e` locally (needs `npm run pb:start`) and confirm CI — including the `e2e-tests` job — is green. A change is not "done" while CI is red.

## MCP Servers — use these first

| Server       | Use for                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| **Context7** | Up-to-date library docs — consult before writing any code that touches a third-party library |

## Key Constraints

- **`.env.local`** — never commit; only `.env.example` with empty values goes in the repo.
- Ask before making any changes to `package.json` or `package-lock.json`.
- Use npm/npx. Do not use pnpm.
- The PocketBase server URL is user-configurable (Settings page) and stored in `useUIStore`. Never hardcode it.
- The app must remain fully functional offline for the shopping flow. Optimistic updates and TanStack Query's mutation queue are the mechanism; do not introduce patterns that require a live server in the critical path of checking off items.
