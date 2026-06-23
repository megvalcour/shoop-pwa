# Task: SelectionList + ItemEntryForm shared molecules

## Problem

Two more pieces of structure are duplicated across the component tree:

1. **Selectable sheet list.** `AislePickerSheet.tsx:33-59` and
   `StoreSwitcherSheet.tsx:33-59` are ~90% identical: a scrollable `<ul>` of
   `<button>` rows where the active row gets `text-primary font-semibold` and a
   trailing `faCheck`. Only the row label and the "selected" comparison differ.

2. **Add-item form.** `AddItemForm.tsx:126-143` and
   `DefaultListEditor.tsx:58-74` render the same pattern: an `sr-only` label, the
   `Input` atom (`flex-1`), and a primary Add `Button` disabled on empty input,
   wired to clear + refocus on submit.

Both are reusability/readability wins and shrink the surface each consumer must
test.

### Current state

- `src/components/molecules/AislePickerSheet.tsx`, `StoreSwitcherSheet.tsx` —
  duplicated selectable list bodies. (See also
  `backlog--shared-modal-bottomsheet-primitives.md`, which extracts the sheet
  *shell*; this task extracts the *list body*.)
- `src/components/organisms/AddItemForm.tsx`, `DefaultListEditor.tsx` —
  duplicated add-item form markup + submit/clear/refocus behavior.

## Relevant ADRs

- **ADR-0005 (atomic design):** both extractions are presentational **molecules**
  composing atoms — no store access. `SelectionList` is generic over its item
  type; `ItemEntryForm` takes `value`/`onChange`/`onSubmit`/`placeholder` props.
- **ADR-0008 (design tokens):** reuse existing token classes verbatim; no restyle.

No ADR is contradicted. **No new ADR required.**

## Approach

### 1. `src/components/molecules/SelectionList.tsx` (new, generic)

```ts
export interface SelectionListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  isSelected: (item: T) => boolean;
  renderLabel: (item: T) => React.ReactNode;   // single line, or two-line node
  onSelect: (item: T) => void;
}
```

- Renders the `overflow-y-auto flex-1 <ul>` of selectable rows with the active-row
  styling and trailing `faCheck`, exactly as the two sheets do today.
- `onSelect` fires for the chosen row; the **caller** decides close-on-select and
  whether to skip re-selecting the current item (StoreSwitcher currently guards
  `if (!isSelected) onSelect(...)`). Keep that guard in the consumer, not the list.

Consumers after migration:

- `AislePickerSheet`: `renderLabel={(a) => formatAisleLabel(a)}` (use the shared
  formatter from `backlog--extract-pure-grouping-and-aisle-format.md` if landed),
  `isSelected={(a) => a.id === currentAisleId}`, `onSelect` → `onSelect(id)` + close.
- `StoreSwitcherSheet`: two-line label (name + muted address), guard re-select.

### 2. `src/components/molecules/ItemEntryForm.tsx` (new)

```ts
export interface ItemEntryFormProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;          // parent does trim/guard/clear/refocus
  placeholder: string;
  inputId: string;               // for the sr-only <label htmlFor>
  inputRef?: React.Ref<HTMLInputElement>;
  disabledSubmit?: boolean;      // default: derive from empty value
}
```

- Renders the `sr-only` label + `Input` (`flex-1`) + primary Add `Button`
  (`type="submit"`, disabled when the trimmed value is empty), inside the
  `flex gap-2 mt-4` form.
- **Behavior policy:** keep clear-and-refocus in the *consumer* organisms (they
  own the `mutate` call and the focus ref), so this molecule stays purely
  presentational. The form's `onSubmit` just calls back; the organism trims,
  clears `value`, refocuses, and mutates — preserving today's "never gate
  back-to-back entry on the mutation" UX.

Consumers after migration:

- `AddItemForm` and `DefaultListEditor` each render `<ItemEntryForm>` and keep
  their own submit handlers + error lines.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/SelectionList.tsx` | **New** generic selectable list. |
| `src/components/molecules/ItemEntryForm.tsx` | **New** add-item form molecule. |
| `src/components/molecules/AislePickerSheet.tsx` | Use `SelectionList`. |
| `src/components/molecules/StoreSwitcherSheet.tsx` | Use `SelectionList` (keep re-select guard + two-line label). |
| `src/components/organisms/AddItemForm.tsx` | Use `ItemEntryForm`. |
| `src/components/organisms/DefaultListEditor.tsx` | Use `ItemEntryForm`. |

## Implementation checklist

- [ ] Create `SelectionList<T>`; migrate both sheets; confirm active-row styling + check icon unchanged.
- [ ] Create `ItemEntryForm`; migrate both organisms; preserve clear/refocus/no-disable UX.
- [ ] New unit tests for both molecules (see below).
- [ ] Keep existing sheet/organism tests green; trim assertions now covered by molecule tests.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` — store switch, aisle re-pick, and add-item (both default
      list and shopping list) flows green.

## Tests

### Unit (RTL, **no mocks**)

- **`SelectionList.test.tsx`**: renders a row per item; the selected row shows the
  check and selected styling; clicking a row calls `onSelect` with that item;
  `getKey`/`renderLabel` honored.
- **`ItemEntryForm.test.tsx`**: typing calls `onChange`; submit (Enter and Add
  button) calls `onSubmit`; Add button disabled on empty value; `sr-only` label is
  associated to the input via `inputId`.

## Dependencies / ordering

- Best landed **after** `backlog--shared-modal-bottomsheet-primitives.md` so the
  sheets already use `BottomSheet` and this task only swaps the list body.
- Uses `formatAisleLabel` from
  `backlog--extract-pure-grouping-and-aisle-format.md` if available (otherwise
  inline the format in `renderLabel` and switch later).

## Out of scope

- Search/filter within `SelectionList` (future enhancement).
- Moving clear/refocus logic into `ItemEntryForm`.
