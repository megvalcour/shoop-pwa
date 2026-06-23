# Task: Shared Modal + BottomSheet primitives

Backlog file: `tasks/backlog--shared-modal-bottomsheet-primitives.md`

## Implementation Plan

### Step 1 — Create `Modal.tsx`
- Backdrop (`absolute inset-0 bg-black/40`, `aria-hidden`, click → `onClose` when `closeOnBackdrop`)
- Centered panel (`relative w-full max-w-sm bg-surface rounded-2xl shadow-xl p-5 flex flex-col gap-3`)
- Props: `onClose`, `role?` (default `'dialog'`), `labelledById?`, `describedById?`, `children`, `closeOnBackdrop?` (default `true`)
- Escape-to-close via `keydown` listener
- Focus management: save `document.activeElement`, focus panel on mount, restore on unmount, Tab-trap inside panel
- Focus trap: hand-roll with `querySelectorAll` for focusable elements

### Step 2 — Create `BottomSheet.tsx`
- `fixed inset-0 z-50 flex flex-col justify-end` wrapper
- Backdrop + `rounded-t-2xl max-h-[60vh] bg-surface shadow-xl` panel
- Titled header: `title` string + `faXmark` close `Button`
- `flex-1 overflow-y-auto` body for `children`
- Same Escape + focus behavior as Modal (reuse the same focus-trap logic internally)

### Step 3 — Migrate consumers
- `ConfirmDialog.tsx` → use `<Modal role="alertdialog" labelledById={titleId} describedById={messageId} onClose={onCancel}>`
- `NewListSheet.tsx` → use `<Modal labelledById={titleId} onClose={onCancel}>`
- `AislePickerSheet.tsx` → use `<BottomSheet title="Choose aisle" onClose={onClose}>`
- `StoreSwitcherSheet.tsx` → use `<BottomSheet title="Switch store" onClose={onClose}>`

### Step 4 — Unit tests
- `Modal.test.tsx`: renders children; backdrop click calls `onClose`; Escape calls `onClose`; `closeOnBackdrop={false}` suppresses backdrop; focus moves into panel on open
- `BottomSheet.test.tsx`: renders title and body; close button + backdrop + Escape each call `onClose`
- Extend `ConfirmDialog.test.tsx` with Escape-closes case
- Extend `AislePickerSheet.test.tsx` with Escape-closes case
- Extend `StoreSwitcherSheet.test.tsx` with Escape-closes case

### Step 5 — Validate
- `npm run validate` clean

## Implementation Checklist

- [ ] Create `Modal.tsx`
- [ ] Create `BottomSheet.tsx`
- [ ] Migrate `ConfirmDialog.tsx`
- [ ] Migrate `NewListSheet.tsx`
- [ ] Migrate `AislePickerSheet.tsx`
- [ ] Migrate `StoreSwitcherSheet.tsx`
- [ ] `Modal.test.tsx`
- [ ] `BottomSheet.test.tsx`
- [ ] Extend consumer tests with Escape-closes
- [ ] `npm run validate` clean
