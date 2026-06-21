---
step: 5
substep: 1
status: planning
class: standard
e2e_required: true
clarifications: |
  Scope = make the shopping-list title on the list **detail** screen
  (ShoppingListDetailRoute) inline-editable by the user, and restyle it to be
  smaller / more subtle (it is currently a large bold display heading).
  Rename persists to the `shopping_lists` record's `name` field.
  Style direction (recommended, not yet confirmed): drop the heavy
  Playfair display heading for a smaller, muted body-font label
  (`text-base font-medium text-text-muted`). See "Style" section — adjust if a
  different weight/size is preferred.
  Out of scope: renaming from the Settings "Your Lists" cards, validation
  beyond non-empty/trim, multi-line titles.
---

# Task: Editable, subtler list title

## Problem

On the list detail screen, the list name is rendered as a large, static
Playfair-display heading and **cannot be changed** after the list is created.
Lists are auto-named `"<Store> - <Month Day>"` at creation
(`useCreateShoppingList`), so the user is stuck with that name forever. Two asks:

1. **Editable** — let the user tap the title and rename the list; persist it.
2. **Subtler** — the title is visually heavy (`font-display text-2xl font-bold`);
   make it smaller and less prominent.

### Current state

- `src/routes/ShoppingListDetailRoute.tsx:37` renders the title statically:
  `<h1 className="font-display text-2xl font-bold text-text mb-4">{list.name}</h1>`.
- `src/hooks/useShoppingLists.ts` has `useShoppingLists`, `useCreateShoppingList`,
  `useDeleteShoppingList` — **no rename/update mutation exists**.
- `src/db/schema.ts` → `ShoppingList = { id, name, created_at }`. Rename only
  touches `name`.
- No inline-edit component exists yet. `Input` atom
  (`src/components/atoms/Input.tsx`) and `Button` atom are available to compose.

## Relevant ADRs

- **ADR-0005 (atomic design):** the inline-edit affordance is a presentational
  **molecule** (`EditableTitle`) — composes the `Input` atom, owns only local
  display/edit state, takes `value` + `onSave` props, **no store/hook access**.
  The **route** owns the rename mutation and passes `onSave`.
- **ADR-0008 (design tokens):** restyle uses existing tokens only
  (`text-text-muted`, `font-body` default, etc.) — no raw hex, no new font stack.
- **ADR-0009 (on-demand shopping list model):** rename is a plain update to the
  `shopping_lists` record; no list_items or schema change. No deviation.

No ADR is contradicted. **No new ADR required** — this adds a conventional
inline-edit molecule and one update mutation, no new architectural pattern.

## Approach

Three pieces: one data-layer mutation, one new molecule, one route wiring +
restyle.

### 1. Data layer — `src/hooks/useShoppingLists.ts`

Add `useRenameShoppingList`:

- `mutationFn({ id, name }: { id: string; name: string })`:
  - `const db = await dbPromise;`
  - `const existing = await db.get('shopping_lists', id);` (guard: if missing,
    throw — caller stays on the optimistic value / surfaces error).
  - `await db.put('shopping_lists', { ...existing, name: name.trim() });`
- **Optimistic update** (offline-first per CLAUDE.md): in `onMutate`, cancel the
  `['shopping_lists']` query, snapshot, and optimistically patch the renamed
  record's `name` in the cached array; `onError` rolls back to the snapshot;
  `onSettled` invalidates `['shopping_lists']`. This keeps the new name visible
  instantly with no network in the path.
- Trim before persisting; the route guards against empty (see below), so the
  hook can assume a non-empty trimmed string but should still `.trim()`
  defensively.

### 2. New molecule — `src/components/molecules/EditableTitle.tsx`

A presentational inline-edit title. No store/hook access.

- Props (interface, strict types):
  - `value: string`
  - `onSave: (next: string) => void`
  - `className?: string` (lets the route control typography/spacing)
  - `ariaLabel?: string` (default `"List name"`)
- Behavior:
  - **Display mode:** a `<button>` showing `value`, styled to look like text
    (inherits the route-provided `className`), `aria-label={\`Rename: ${value}\`}`.
    Tapping enters edit mode.
  - **Edit mode:** render the `Input` atom seeded with `value`, `autoFocus`, and
    select-all on focus. The input inherits the same typography classes so the
    size doesn't jump between modes.
    - **Enter** or **blur** → commit: `const next = draft.trim();` if `next` is
      non-empty **and** `next !== value`, call `onSave(next)`; otherwise revert.
      Either way leave edit mode.
    - **Escape** → cancel: discard draft, leave edit mode, no `onSave`.
  - Local state only: `const [editing, setEditing] = useState(false)` and a
    `draft` string. Re-seed `draft` from `value` whenever entering edit mode.
- Accessibility: input gets `aria-label`; the trigger button is keyboard-
  focusable and labelled.

### 3. Route wiring + restyle — `src/routes/ShoppingListDetailRoute.tsx`

- Import `useRenameShoppingList` and `EditableTitle`.
- Replace the static `<h1>` with:
  ```tsx
  <EditableTitle
    value={list.name}
    onSave={(name) => renameList.mutate({ id, name })}
    className="font-body text-base font-medium text-text-muted mb-4 text-left"
  />
  ```
- Keep it inside the existing `<div className="flex flex-col px-4 py-4">`.

## Style (smaller / more subtle)

| | Before | After (recommended) |
| --- | --- | --- |
| Font | `font-display` (Playfair 700) | `font-body` (DM Sans) |
| Size | `text-2xl` | `text-base` |
| Weight | `font-bold` | `font-medium` |
| Color | `text-text` | `text-text-muted` |

Rationale: a list whose name is auto-generated boilerplate ("Store - June 21")
doesn't warrant a hero heading; demoting it to a muted body label makes the
items the focus. The exact size/weight is a taste call — if the user wants it a
touch more present, bump to `text-lg` and/or keep `text-text`. Adjust the single
`className` string; no other code changes.

## Files to change

| File | Change |
| --- | --- |
| `src/hooks/useShoppingLists.ts` | **Add** `useRenameShoppingList` (optimistic update mutation). |
| `src/components/molecules/EditableTitle.tsx` | **New** presentational inline-edit title molecule. |
| `src/routes/ShoppingListDetailRoute.tsx` | Swap static `<h1>` for `EditableTitle`; apply subtler styling; wire rename. |

## Implementation checklist

- [ ] Add `useRenameShoppingList` to `src/hooks/useShoppingLists.ts` with
      optimistic update + rollback + settle-invalidate.
- [ ] Create `src/components/molecules/EditableTitle.tsx` per spec.
- [ ] Update `src/routes/ShoppingListDetailRoute.tsx`: render `EditableTitle`,
      wire `onSave`, apply subtler `className`.
- [ ] Unit test: `src/components/molecules/__tests__/EditableTitle.test.tsx`.
- [ ] Extend `src/hooks/__tests__/useShoppingLists.test.ts` with rename cases.
- [ ] Extend `e2e/shopping-lists.spec.ts` with the rename flow.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` (rename flow) green.

## Tests

### Unit / integration (Vitest + RTL)

- **`EditableTitle.test.tsx`** (new):
  - Renders `value` as a button in display mode.
  - Clicking the button reveals an input seeded with `value`.
  - Typing a new value + pressing **Enter** calls `onSave` with the trimmed text
    and returns to display mode.
  - **Blur** commits the same way as Enter.
  - Pressing **Escape** does **not** call `onSave` and restores the original
    value.
  - Committing an unchanged or whitespace-only value does **not** call `onSave`
    (and exits edit mode).
- **`useShoppingLists.test.ts`** (extend):
  - Seed a list, call `useRenameShoppingList` with a new name, assert the
    `shopping_lists` record's `name` is updated (trimmed) and `id`/`created_at`
    are unchanged.
  - Renaming a non-existent id surfaces an error (mutation rejects).

### E2E (Playwright) — `e2e/shopping-lists.spec.ts` (extend)

- Open a list, tap the title, type a new name, press Enter, assert the new name
  is shown; reload the page and assert it persisted (IndexedDB round-trip).

## Validation

1. `npm run validate` (typecheck + lint + Vitest).
2. `npm run test:e2e` — rename flow green.

## Out of scope

- Renaming from the Settings "Your Lists" cards (detail screen only).
- Name validation beyond trim + non-empty (no length cap, no uniqueness).
- Multi-line / rich titles.
- Changing the auto-generated name format at creation time.
