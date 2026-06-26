---
step: 6
substep: 6
status: validating
class: lightweight
e2e_required: false
clarifications: |
  Scope is unambiguous — no clarifications needed.
---

# Task: General Store Reorder + Help Text Update

## Goal

1. Move the General Store to the bottom of every store list surface (Settings page, Store Switcher sheet).
2. Change its subtitle from "Common grocery layout" to "Any ol' store".

## Relevant ADRs

- ADR-0015 (Store Switcher) — covers the switcher UI but imposes no ordering constraint. No conflict.
- No ADR governs store display order.

## Context

- Store list is rendered in two places, both consuming `useStores` from `src/hooks/useStores.ts`.
- `useStores` calls `db.getAll('stores')`, which returns stores in IndexedDB insertion order — no sort applied.
- The General Store has a fixed slug `"general"` and UUID `2927f300-21b7-4666-962e-5b99537ec226`.
- The `address` field ("Common grocery layout") is seed data stored in IndexedDB; it is also defined in `src/assets/aisles/general.json`. Changing the JSON alone only affects fresh installs. A DB migration is needed to update existing records.
- `DB_VERSION` bump requires a `feat:` commit per AGENTS.md and must be confirmed non-breaking before committing.

## Implementation Checklist

- [x] **1. Update seed JSON** — In `src/assets/aisles/general.json`, change `"address": "Common grocery layout"` → `"address": "Any ol' store"`.

- [x] **2. Sort General Store last in `useStores`** — In `src/hooks/useStores.ts`, after `db.getAll('stores')`, sort so any store with `slug === 'general'` sorts to the end. All other stores retain their relative order.

- [x] **3. Add DB migration** — In `src/db/idbClient.ts`, bump `DB_VERSION` by 1 and add a new `if (oldVersion < N)` case inside `upgrade()` that finds the General Store by its known UUID and updates its `address` to `"Any ol' store"`. This fixes existing installations. (Confirm with user that this is a non-breaking change before making the `feat:` commit.)

- [x] **4. Smoke test** — Verify in the running app that:
  - Settings → store list shows General Store last.
  - Store Switcher sheet shows General Store last.
  - General Store subtitle reads "Any ol' store" in both places.

## Out of Scope

- Sorting user-created stores relative to each other (they retain insertion order).
- Any UI changes beyond the subtitle string and list order.
- E2E test additions (Lightweight task; existing E2E suite covers store switching).

## Risks / Notes

- The `DB_VERSION` bump is the only structurally non-trivial step. It is a non-breaking data fixup (no schema change, no object store or index modifications). Confirm with user before the `feat:` commit.
- If the user clears their IndexedDB between now and deployment, the migration is moot — the fresh seed will already have the updated address.
- **Implementation note**: The v8 migration should use the `GENERAL_STORE_ID` constant already exported from `idbClient.ts` (used in the v7 case) rather than an inline UUID string.

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.
