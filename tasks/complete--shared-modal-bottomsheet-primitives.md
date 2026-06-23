# Task: Shared Modal + BottomSheet primitives

## Problem

Four components hand-roll the same overlay scaffolding, with subtly inconsistent
accessibility and no shared behavior:

- **Centered dialogs:** `ConfirmDialog.tsx` and `NewListSheet.tsx` each render
  `fixed inset-0 z-50 flex items-center justify-center p-4` + a `bg-black/40`
  backdrop + a `max-w-sm bg-surface rounded-2xl shadow-xl` panel.
- **Bottom sheets:** `AislePickerSheet.tsx` and `StoreSwitcherSheet.tsx` each
  render `fixed inset-0 z-50 flex flex-col justify-end` + backdrop + a
  `rounded-t-2xl max-h-[60vh]` panel with a titled header and a close button.

The duplication is a readability/reusability cost, and the a11y is uneven:
`ConfirmDialog` is `role="alertdialog"`/`aria-modal` but has **no Escape-to-close
and no focus trap**; the sheets close on backdrop click but not on Escape. Fixing
this per-component means fixing it four times forever.

### Current state

- `src/components/molecules/ConfirmDialog.tsx` — centered, `role="alertdialog"`,
  `useId` title/desc, confirm/cancel buttons, pending/error states.
- `src/components/molecules/NewListSheet.tsx` — centered, `role="dialog"`,
  `useId` title, three action buttons.
- `src/components/molecules/AislePickerSheet.tsx` — bottom sheet, titled header +
  close, scrollable selectable list.
- `src/components/molecules/StoreSwitcherSheet.tsx` — bottom sheet, near-identical
  to AislePickerSheet.

## Relevant ADRs

- **ADR-0005 (atomic design):** these primitives are presentational and compose
  only atoms/markup — they belong as **molecules** (`Modal`, `BottomSheet`),
  consumed by the existing dialog/sheet molecules and organisms. No store access.
- **ADR-0008 (design tokens):** the primitives must use existing tokens
  (`bg-surface`, `bg-black/40`, `rounded-2xl`/`rounded-t-2xl`, `shadow-xl`,
  `border-border`) — no new raw values; this is a consolidation, not a restyle.

No ADR is contradicted. **No new ADR required** (a shared overlay primitive is a
conventional UI pattern, not a new architectural decision). If we add a focus-trap
dependency, note it in the PR and confirm per the package.json rule in CLAUDE.md.

## Approach

### 1. `src/components/molecules/Modal.tsx` (new) — centered dialog shell

Props:

```ts
export interface ModalProps {
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';   // default 'dialog'
  labelledById?: string;             // caller owns title element + id (useId)
  describedById?: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;         // default true
}
```

- Renders the backdrop (`absolute inset-0 bg-black/40`, `aria-hidden`, click →
  `onClose` when `closeOnBackdrop`) + the centered panel
  (`relative w-full max-w-sm bg-surface rounded-2xl shadow-xl p-5 flex flex-col gap-3`).
- **Escape closes** (keydown listener while mounted).
- **Focus management:** focus the panel on mount, restore focus to the previously
  focused element on unmount, and trap Tab within the panel. Keep this minimal
  and dependency-free if practical; only add a library if hand-rolling proves
  fragile (and then follow the package.json approval rule).

### 2. `src/components/molecules/BottomSheet.tsx` (new) — bottom sheet shell

Props:

```ts
export interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;        // the scrollable body
}
```

- Renders `fixed inset-0 z-50 flex flex-col justify-end` + backdrop + the
  `rounded-t-2xl max-h-[60vh] bg-surface shadow-xl` panel with the standard titled
  header (title + `faXmark` close `Button`) and a `flex-1 overflow-y-auto` body.
- Same Escape + focus behavior as `Modal`.

### 3. Migrate the four consumers

- `ConfirmDialog` and `NewListSheet` → render their content inside `<Modal>`,
  passing `labelledById`/`describedById` (keep their `useId` titles). They keep
  their own button rows, pending/error states, and copy.
- `AislePickerSheet` and `StoreSwitcherSheet` → render their selectable list
  inside `<BottomSheet title="Choose aisle" />` / `title="Switch store"`. (Their
  list bodies are themselves near-identical — see the companion task
  `backlog--selectionlist-itementryform-molecules.md`, which extracts a shared
  `SelectionList`. Land Modal/BottomSheet first; SelectionList stacks on top.)

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/Modal.tsx` | **New** centered dialog shell (backdrop, Escape, focus trap). |
| `src/components/molecules/BottomSheet.tsx` | **New** bottom-sheet shell (titled header, close, Escape, focus). |
| `src/components/molecules/ConfirmDialog.tsx` | Render content inside `Modal`. |
| `src/components/molecules/NewListSheet.tsx` | Render content inside `Modal`. |
| `src/components/molecules/AislePickerSheet.tsx` | Render list inside `BottomSheet`. |
| `src/components/molecules/StoreSwitcherSheet.tsx` | Render list inside `BottomSheet`. |

## Implementation checklist

- [ ] Create `Modal` with backdrop, Escape-to-close, focus-on-open, focus-restore, Tab trap.
- [ ] Create `BottomSheet` with titled header + close + same a11y behavior.
- [ ] Migrate `ConfirmDialog`, `NewListSheet` to `Modal` (preserve roles/`useId`/copy).
- [ ] Migrate `AislePickerSheet`, `StoreSwitcherSheet` to `BottomSheet`.
- [ ] Add `Modal`/`BottomSheet` unit tests (see below).
- [ ] Keep existing consumer tests green (behavior unchanged); add Escape-close assertions.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` — open/close of the store switcher, aisle picker, new-list
      chooser, and delete-confirm dialogs all still work (these are
      gesture/overlay flows E2E can catch and `validate` cannot).

## Tests

### Unit (RTL, **no mocks**)

- **`Modal.test.tsx`**: renders children; backdrop click calls `onClose`;
  Escape calls `onClose`; `closeOnBackdrop={false}` suppresses backdrop close;
  focus moves into the panel on open.
- **`BottomSheet.test.tsx`**: renders `title` and body; close button + backdrop +
  Escape each call `onClose`.
- Consumer tests: extend `ConfirmDialog`/sheet tests with an Escape-closes case.

## Out of scope

- Animations/transitions (can be a later polish task).
- Extracting the selectable list body (see companion `SelectionList` task).
- Restyling beyond consolidating existing classes.
