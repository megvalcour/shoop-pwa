# Active Task: Market Basket logo swap + store-switcher sheet

## Goal

1. Replace the current Market Basket store logo with the new "MB" circular logo (uploaded image).
2. Make the header logo tappable. Tapping opens a bottom sheet to switch store (**UI only** — no
   real switching/persistence yet), showing the current store as active and **Big Y** as a
   "Coming soon" disabled option.

## Relevant existing code

- `src/components/atoms/StoreLogo.tsx` — pure `<img>` atom, src derived as `/store-logos/${slug}.png`.
- `src/components/organisms/StoreHeader.tsx` — renders `StoreLogo` + store name/address; uses `useActiveStore()`.
- `src/components/molecules/AislePickerSheet.tsx` — existing bottom-sheet pattern to model the new sheet on.
- `src/components/atoms/Badge.tsx` — `muted` variant for the "Coming soon" tag.
- `src/hooks/useStores.ts` — `useStores()` (all stores), `useActiveStore()` (first store).
- Store slug is `oxford-62` (`src/assets/aisles/oxford-62.json`), logo at `public/store-logos/oxford-62.png`.

## Atomic-design note

`StoreLogo` stays a pure atom (no click logic). The tap affordance + sheet `open` state live in the
`StoreHeader` organism (organisms may hold state and use hooks). The sheet itself is a new **molecule**
modeled on `AislePickerSheet`.

## Plan

### 1. Swap the logo asset
- Overwrite `public/store-logos/oxford-62.png` with the new MB logo (source is a 400×400 JPEG).
- Convert JPEG → PNG so the file's bytes match its `.png` name and the `StoreLogo` atom + its test
  (which assert the `.png` path) stay unchanged.
  - Convert via a transient, non-persisted encoder: `npm install --no-save sharp` (does **not** modify
    `package.json`/lockfile), run a one-off conversion script, then proceed.
  - If the registry is unreachable, fall back to writing the asset as `oxford-62.jpg` and updating the
    single `.png` reference in `StoreLogo.tsx` (and its test). Will flag if this fallback is needed.

### 2. New molecule: `StoreSwitcherSheet.tsx`
- Bottom sheet mirroring `AislePickerSheet` (backdrop, rounded-top surface, header w/ close button).
- Props: `{ stores: Store[]; currentStoreId: string; onClose: () => void }` — UI only, no `onSelect`.
- Header label: "Switch store".
- One row per store from `stores`, check icon on the current store.
- A disabled "Big Y" row with a `muted` Badge reading "Coming soon".
- Backdrop click and × button both call `onClose`.

### 3. Wire up `StoreHeader`
- Add `const [open, setOpen] = useState(false)`.
- Wrap the logo (and store text) in a `button` with `aria-label="Switch store"` that calls `setOpen(true)`.
- Render `<StoreSwitcherSheet stores={stores} currentStoreId={store.id} onClose={() => setOpen(false)} />`
  when `open`. Use `useStores()` for the full list, `useActiveStore()` for the current id.

### 4. Tests
- `src/components/molecules/__tests__/StoreSwitcherSheet.test.tsx`:
  - renders the active store row with a check,
  - renders a disabled "Big Y" row + "Coming soon" badge,
  - calls `onClose` on backdrop and on × button.
- `src/components/organisms/__tests__/StoreHeader.test.tsx` (new):
  - clicking the logo button opens the sheet (sheet content appears).

### 5. Validate
- `npm install`, then `npm run validate` (typecheck + lint + Vitest). Fix anything red.

## Out of scope
- Real store switching / persistence (backlog "Store Switcher" items) — this is UI only.
- Re-scoping aisles/lists to a selected store.
