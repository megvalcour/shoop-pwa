# Use Zustand for Ephemeral UI State and TanStack Query for Persistent Data

## Status

Accepted

## The Problem

We need two distinct state management concerns: session-only UI toggles (active tab, expanded aisles) and persistent, reactively cached reads/writes to IndexedDB.

## Options Considered

- Single global Redux store for all state
- React context for both concerns
- **Zustand for ephemeral UI state + TanStack Query with a custom IndexedDB storage adapter for persistent data**

## Rationale

Mixing persistent and ephemeral state in one store creates unnecessary coupling: UI toggles would trigger IndexedDB writes (or require careful partitioning inside the same store). Zustand is lightweight and slice-friendly for session state that intentionally resets on reload. TanStack Query provides query key-based caching, background invalidation, optimistic updates, and a consistent async data layer — exactly what IndexedDB reads need to feel reactive without manual subscription plumbing. The two libraries have non-overlapping responsibilities and compose cleanly.

## Notes

- Zustand slices live in `src/stores/`; none of them write to IndexedDB.
- TanStack Query hooks live in `src/hooks/`; none of them import from Zustand.
- A single monolithic store is explicitly forbidden — see CLAUDE.md Workflow Requirements.
