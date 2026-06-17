# Replace Weekly List with On-Demand Shopping Lists

## Status

Accepted

## The Problem

The original schema modeled grocery shopping as a weekly recurring activity (`weekly_list` with a `week_start` date), but users need to create and manage named shopping trips on demand with no time-scoping.

## Options Considered

- Keep `weekly_list`: single static list tied to the current week
- Weekly default + extras: retain weekly as a default but allow additional lists
- **On-demand named lists: user-created `shopping_lists` (id, name, created_at) with `list_items` rows (id, list_id Index, item_id, quantity, checked, added_from_default)**

## Rationale

A weekly model imposes a cadence that doesn't match real usage (e.g. "Costco run", "Thursday top-up"). On-demand lists give the user full control with no schema complexity overhead. The hybrid option adds branching logic with no clear benefit for a single-user app. `added_from_default` is included now so the future "Copy default list" feature requires no schema change.

## Notes

- DB v1→v2 migration deletes `weekly_list` and creates `shopping_lists` and `list_items`; append-only per ADR-0002.
- All future list-related stories (`useShoppingLists`, `AddItemForm`, `ShoppingListBuilder`, check-off, delete) must use these two stores and their field shapes.
- Supersedes the implicit weekly-list model established during the IndexedDB bootstrap (ADR-0002).
