---
step: 7
substep: 3
status: security_review
class: standard
e2e_required: false
clarifications: |
  1. Refactor scope: Yes, update existing molecules/organisms to use the new atoms.
  2. Atom set: Focus only on atoms needed by existing molecules/organisms (Button, Input, Badge).
  3. Button variants: Yes, include variant prop from the start (primary, ghost, destructive).
  4. E2E required: No.
---

# Atomic Design Audit — Create Atoms & Refactor Consumers

## Relevant ADRs

- **ADR-0005** (Atomic Design Component Model): Atoms live in `src/components/atoms/`, no business logic, no store access.
- **ADR-0008** (Design Tokens and Visual Identity): All atoms must use `@theme` CSS tokens (`bg-primary`, `text-accent`, etc.). No raw hex values or one-off font stacks.

## Audit Findings

No `atoms/` layer exists. Existing molecules and organisms inline button, input, and badge styling ad hoc. Three atoms are warranted by actual usage:

| Atom | Used in | Purpose |
|------|---------|---------|
| `Button` | `AddItemForm`, `GroceryListItem`, `AislePickerSheet` | Action buttons with `primary`, `ghost`, `destructive` variants |
| `Input` | `AddItemForm` | Styled text input |
| `Badge` | `GroceryListItem` | Aisle-label pill (clickable) and analyzing indicator (display-only) |

**Out of scope:**
- `ShoppingListCard` card-button — layout molecule, not a generic action button
- `AislePickerSheet` list-option buttons — selection context with check-mark state
- `ShoppingListsRoute` FAB — route-level, not a molecule/organism
- Checkbox and Icon atoms — not used in existing code

## Implementation Checklist

### 1. Button atom

- [x] Create `src/components/atoms/Button.tsx`
  - `interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>` with `variant?: 'primary' | 'ghost' | 'destructive'`
  - `primary`: `rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50`
  - `ghost`: `p-1 text-text-muted`
  - `destructive`: `p-1 text-destructive`
  - Default variant: `ghost`
  - Use `React.forwardRef<HTMLButtonElement, ButtonProps>`

### 2. Input atom

- [x] Create `src/components/atoms/Input.tsx`
  - `interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>`
  - Styling: `rounded-lg border border-border bg-card px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50`
  - Use `React.forwardRef<HTMLInputElement, InputProps>`
  - Note: use `bg-card` not `bg-white` — `bg-white` is a raw Tailwind utility, `bg-card` is the ADR-0008-compliant design token (`--color-card: #FFFFFF`)

### 3. Badge atom

- [x] Create `src/components/atoms/Badge.tsx`
  - Props: extend `React.ButtonHTMLAttributes<HTMLButtonElement>` and add `variant?: 'default' | 'muted'` and `children: React.ReactNode`. Do NOT list `onClick`, `aria-label`, `className` individually — they flow through the extended interface, giving consumers the full HTML attribute surface without type errors.
  - When `onClick` is present in props → renders as `<button type="button">`; otherwise → `<span>`
  - `default`: `shrink-0 rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary`
  - `muted`: `shrink-0 rounded px-1.5 py-0.5 text-xs bg-surface text-text-muted`

### 4. Refactor AddItemForm

- [x] Replace `<input>` with `<Input>` atom from `@/components/atoms/Input`
- [x] Replace submit `<button>` with `<Button variant="primary">` from `@/components/atoms/Button`

### 5. Refactor GroceryListItem

- [x] Replace delete `<button aria-label="Delete item">` with `<Button variant="destructive">`
- [x] Replace aisle label `<button>` with `<Badge onClick={...} aria-label={...}>` — preserve the existing `onClick` handler exactly: `(e) => { e.stopPropagation(); setSheetOpen(true); }`. The `e.stopPropagation()` call is required to prevent the row's `onToggle` from firing.
- [x] Replace analyzing `<span>` with `<Badge variant="muted" className="animate-pulse">`

### 6. Refactor AislePickerSheet

- [x] Replace close `<button aria-label="Close aisle picker">` with `<Button variant="ghost">`

### 7. Unit tests for atoms

- [x] Create `src/components/atoms/__tests__/Button.test.tsx`
  - All three variants render without error
  - `disabled` prop is passed through and applied
  - `onClick` is called on click
- [x] Create `src/components/atoms/__tests__/Input.test.tsx`
  - Renders with placeholder text
  - `onChange` fires on user input
  - `disabled` prop is passed through
- [x] Create `src/components/atoms/__tests__/Badge.test.tsx`
  - Renders as `<span>` when no `onClick` provided
  - Renders as `<button>` when `onClick` is provided
  - `default` and `muted` variants both render
  - `onClick` fires on click

**Review**: Approved by fresh session. Three issues fixed before coding: (1) Input `bg-white` → `bg-card` per ADR-0008; (2) Badge props now extend `ButtonHTMLAttributes` instead of listing individual attrs; (3) GroceryListItem Badge refactor explicitly preserves `e.stopPropagation()`. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.
