# Route `/` to ShopRoute with Auto-Redirect to Most Recent List

## Status

Accepted

## The Problem

Define the primary navigation structure and how the app's entry point (`/`) routes users into the shopping flow.

## Options Considered

- Route `/` directly to a shopping lists index (user must pick a list each visit)
- Route `/` to a dedicated "Home" screen with quick-actions
- **Route `/` to `ShopRoute`, which auto-redirects to the most recently created list, or shows an empty-state CTA if no lists exist**

## Rationale

The app has one primary job: ongoing grocery shopping. Sending the user directly into the active list on every launch minimizes taps for the dominant use case. Settings (list management, default list) is secondary and lives under a dedicated Settings tab. Two tabs (Shop, Settings) replaces the prior three, reducing decision overhead.

## Notes

- The Shop tab stays visually active when the URL is `/lists/:id` because Shop redirects there; `AppShell` extends the active-state check to `location.pathname.startsWith('/lists/')`.
- Settings is the canonical place to create new lists and navigate between them.
- `useActiveStore` returns `stores[0]` — single-store context; multi-store support (Store Switcher) is deferred.
- `ShoppingListsRoute` was deleted; its functionality was split between `ShopRoute` (redirect) and `SettingsRoute` (list management).
