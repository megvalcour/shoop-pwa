# Current Store Indicator on Store Detail Page

## Goal

Add a small UI element to `StoreDetailRoute` (below the store header, above the Aisles heading) that communicates whether this store is the active/current store, and lets the user set it as the active store in one tap.

## Constraint

The primary store-switching affordance already lives in `StoreHeader` (the blue header bar on the Shop tab). This feature is a secondary, contextual affordance — visible only when you're already browsing a store's detail page.

## Behavior

- **If this store IS the active store:** Show a static `Badge` reading "Current store" (variant `default`, which renders in primary blue). No action required — it's informational.
- **If this store is NOT the active store:** Show a `Button` (variant `secondary`) reading "Set as current store". On press, calls `setActiveStoreId.mutate(store.id)` and the badge state updates automatically via TanStack Query cache invalidation.

## Implementation

### Files to change

**`src/routes/StoreDetailRoute.tsx`** — the only file that needs to change.

### What to add

1. Import `useActiveStore` from `@/hooks/useStores` and `useSetActiveStoreId` from `@/hooks/usePreferences`.
2. Import `Badge` from `@/components/atoms/Badge` and `Button` from `@/components/atoms/Button`.
3. Call both hooks near the top of the component (alongside the existing `useStores` and `useAisles` calls).
4. Replace the placeholder comment at line 98 with a conditional:

```tsx
{store.id === activeStore?.id ? (
  <Badge className="mb-4 self-start">Current store</Badge>
) : (
  <Button
    variant="secondary"
    className="mb-4 self-start"
    onClick={() => setActiveStoreId.mutate(store.id)}
    disabled={setActiveStoreId.isPending}
  >
    Set as current store
  </Button>
)}
```

### No new components

`Badge` and `Button` atoms cover both states. `StoreDetailRoute` is already hook-heavy (it calls `useStores`, `useAisles`, `useReorderAisles`), so adding two more hooks is consistent with its existing character as a route-level component.

## Validation

- `npm run validate` (typecheck + lint + unit tests)
- Manual smoke test: navigate to a store detail page that is not the active store → tap "Set as current store" → badge changes to "Current store" without a full reload.
- Navigate to the active store's detail page → shows "Current store" badge immediately.
