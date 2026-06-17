# Use IndexedDB as the Sole Persistence Layer

## Status

Accepted

## The Problem

The app must store relational grocery data (stores, aisles, items, lists) fully offline with no backend infrastructure.

## Options Considered

- Remote database (Supabase, Firebase, PocketBase) with offline sync
- localStorage / sessionStorage (synchronous, size-limited)
- SQLite via WASM (e.g., `sql.js`, `wa-sqlite`)
- **IndexedDB via the `idb` wrapper — async, transactional, structured, runs entirely on-device**

## Rationale

IndexedDB is the only browser-native storage primitive that supports structured data, secondary indexes, transactions, and multi-megabyte payloads — all without a network. It satisfies the offline-first requirement at zero infrastructure cost. The `idb` library provides a clean Promise-based API over the raw `IDBRequest` event model. Remote options were ruled out because the app is intentionally single-user with no sync requirement. SQLite/WASM adds binary distribution complexity with no benefit over IndexedDB for this schema.

## Notes

- All object stores are defined in `src/db/schema.ts`; migration logic lives in `src/db/idbClient.ts`.
- TanStack Query is layered on top (see ADR-0004) to provide caching and reactive invalidation.
