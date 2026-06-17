# Shoop PWA — High-Level Build Plan (Local-First Edition)

## Overview

A personal progressive web app for managing a weekly grocery shopping list, organized by store aisle. Built as a streamlined, single-repository Vite + React PWA. Designed for single-user, 100% offline-first use installed on a mobile device, utilizing **IndexedDB** for local data persistence.

---

## Tech Stack

| Layer                  | Choice                                                  | Rationale                                                                     |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Build Tool             | Vite                                                    | Fast HMR, excellent PWA plugin ecosystem via `vite-plugin-pwa`                |
| UI framework           | React 19                                                | Component model, ecosystem breadth                                            |
| Routing                | React Router v7 (library mode)                          | SPA routing, nested layouts, typed params; no framework overhead              |
| Persistence / Cache    | TanStack Query v5 + IndexedDB (`idb`)                   | Local state caching with automatic, persistent hydration to IndexedDB         |
| Ephemeral UI state     | Zustand                                                 | Lightweight; owns fleeting/session state (e.g., active tabs, expanded aisles) |
| Styling                | Tailwind CSS v4                                         | Utility-first, fast iteration, native performance optimizations               |
| Component model        | Atomic Design                                           | Atoms → Molecules → Organisms → Templates → Pages                             |
| Semantic matching      | `@huggingface/transformers` (`Xenova/all-MiniLM-L6-v2`) | In-browser WASM, offline after first load, zero server infrastructure         |
| Unit/integration tests | Vitest + React Testing Library                          | Fast, native Vite integration, co-located configs                             |
| E2E tests              | Playwright                                              | Cross-browser, mobile viewport emulation                                      |
| Architecture docs      | ADRs (Markdown)                                         | Lightweight, version-controlled decision log                                  |

> **Note on Local-First Data:** This project does not use a remote server database (like PocketBase or Supabase). All relational data maps straight to IndexedDB object stores. TanStack Query acts as the data-orchestration layer using a persistent storage adapter (e.g., `persistQueryClient`), reading/writing asynchronously to IndexedDB.

---

## Project Planning

- `PLAN.md` — read this first every session for current status and active task orientation.
- `tasks/active--*.md` — full implementation plan for the current task.
- `tasks/complete--*.md` — completed task plans.
- `tasks/backlog--*.md` — future tasks, one-liners only until promoted to active.

When a task completes, move the 5 most recent entries to `CHANGELOG.md` when updating `PLAN.md`.

---

## Architecture Decision Records

ADRs live in `docs/adr/`. Check for relevant ADRs before altering implementation boundaries. **ADRs are immutable once accepted.** If a decision shifts, create a new one and mark the previous one as `Superseded by ADR-NNN`.

### ADR Summaries

| #    | Decision                             | Rationale                                                                                                                                   |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | Single-Repo Vite Architecture        | Eliminates monorepo orchestration complexity; app logic, static assets, and configurations sit in a unified root structure.                 |
| 0002 | IndexedDB for Core Storage           | Ensures zero infrastructure costs, true offline functionality, and instant data reads/writes directly on-device.                            |
| 0003 | Migrate to @huggingface/transformers | Uses the official v3 continuation of Transformers.js; execution occurs via client WASM threads.                                             |
| 0004 | Zustand + TanStack Query persistent  | Zustand handles non-persistent UI toggles. TanStack Query interacts with IndexedDB via a customized asynchronous storage abstraction layer. |
| 0005 | Atomic Design                        | Enforces clean UI reusability boundaries early.                                                                                             |
| 0006 | React Router v7 in library mode      | Eliminates SSR complexities while providing optimized client-side routing structures.                                                       |

---

## Data Model (IndexedDB Object Stores)

```
stores
  id (string, PK), name (string), address (string), slug (string)

aisles
  id (string, PK), store_id (string, Index), number (string), label (string), sort_order (number)

items
  id (string, PK), name (string), canonical_name (string), aisle_id (string, Index), store_id (string, Index)

default_list
  id (string, PK), item_id (string), quantity (number), unit (string), notes (string)

weekly_list
  id (string, PK), week_start (string/date), item_id (string), quantity (number),
  checked (boolean), added_from_default (boolean)

```

---

## Directory Structure

```
src/
  components/                 # Atomic Design implementation
    atoms/                    # Smallest units: Button, Checkbox, Input, Badge, Icon
    molecules/                # Groups of atoms: GroceryItem, AisleGroup, SearchBar
    organisms/                # Complex UI blocks: DefaultListEditor, WeeklyListBuilder
    templates/                # Page layouts/wireframes: AppShell
  routes/                     # React Router v7 route components
  db/                         # IndexedDB initialization, migration logic, and schemas
    idbClient.ts
    schema.ts
  hooks/                      # TanStack Query custom hooks wrapping IndexedDB queries
    useStores.ts
    useLists.ts
  stores/                     # Ephemeral UI Zustand slices
    useUIStore.ts
  services/                   # Local utility services (e.g., HuggingFace embedding engine)
    classifier.ts
  assets/                     # Aisle seed JSON files & global styling
    aisles/                   # Static store layout definitions (e.g., oxford-62.json)
public/
  manifest.json
  service-worker.js
docs/
  adr/                        # Architecture Decision Records
  prd/                        # Product Requirements Documents
e2e/                          # Playwright end-to-end tests

```

---

## Workflow Requirements

1. **Plan Before Action:** Write out feature steps into `tasks/active--<feature-name>.md` before implementation.
2. **Type Safety:** Ensure structural definitions match the core TypeScript definitions matching the IndexedDB schema. Prefer `interface` configurations.
3. **Atomic Design Boundaries:** Strictly decouple pure UI (Atoms/Molecules) from stateful hooks (Organisms/Pages).
4. **No Relative Imports:** Always utilize clean path-aliased configurations (e.g., `@/components/atoms/Button`, `@/db/idbClient`).

---

## Interaction Patterns

- Prioritize the reuse of baseline elements (`Atoms`) before introducing fresh variations.
- Isolate database transaction mechanisms within your local custom query hooks (`@/hooks/`), avoiding inline IndexedDB queries inside frontend templates.

---

## Helpful Scripts

| Goal                                    | Command                |
| --------------------------------------- | ---------------------- |
| Dev Environment Launch                  | `npm run dev`          |
| Production Application Compilation      | `npm run build`        |
| Typecheck + lint + unit test (one shot) | `npm run validate`     |
| Typecheck validation                    | `npm run typecheck`    |
| Codebase Linting                        | `npm run lint`         |
| Unit Testing Core Components            | `npm run test`         |
| Playwright E2E execution                | `npm run test:e2e`     |
| Code Formatting Verification            | `npm run format:check` |

---

## MVP Scope

The MVP delivers a complete local-first application scoped to one initial location (Oxford Market Basket #62).

### Features

**Default List Management**

- View standing items grouped dynamically by assigned aisle.
- Add items via descriptive text input. Semantic matching parses data in-browser via `@huggingface/transformers` to intelligently flag the correct grocery aisle automatically.
- Adjust values, quantities, and operational item context tags locally.

**Weekly List Builder**

- Single-tap action duplication mapping the structural `default_list` store straight into active `weekly_list` records.
- Add instant one-off items unique to the current calendar shopping trip.

**Shopping View**

- Items displayed in chronological store layout (aisle order sequence).
- Tap item: triggers an instantaneous UI transition (muted/checked state) and commits background mutation updates to IndexedDB.
- Persistent offline utility operating independently of network connections.

**PWA Lifecycle**

- Native platform installable prompts across mobile browsers.
- Embedded local Service Workers caching static production assets and local HuggingFace neural network weights.

---

## Future Features

### Phase 2 — Multi-Store Support

- Expand the IndexedDB store layout schemas to filter query views on an active `store_id`.
- Dynamic parsing configurations handling multiple static store configuration matrices.

### Phase 3 — Local Image Storage

- Leverage an additional IndexedDB object store designed to hold compressed base64 or raw **Blob payloads** mapping photos directly alongside grocery items.
- Utilize standard local HTML mobile input mechanisms (`capture="environment"`) to stream imagery processing loops fully in-client.

### Phase 4 — Data Syncing and Backup

- Exposing a JSON Export / Import tool within the local app Settings dashboard to easily back up or move local list data between independent mobile devices.
