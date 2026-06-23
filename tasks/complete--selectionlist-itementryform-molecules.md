---
step: 10
substep: 5
status: final_checks
class: standard
e2e_required: true
clarifications: |
  Plan was pre-reviewed and approved by user before implementation session.
---

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

## Relevant ADRs

- **ADR-0005 (atomic design):** both extractions are presentational **molecules**
  composing atoms — no store access. `SelectionList` is generic over its item
  type; `ItemEntryForm` takes `value`/`onChange`/`onSubmit`/`placeholder` props.
- **ADR-0008 (design tokens):** reuse existing token classes verbatim; no restyle.

No ADR is contradicted. **No new ADR required.**

## Implementation checklist

- [x] Create `SelectionList<T>`; migrate both sheets; confirm active-row styling + check icon unchanged.
- [x] Create `ItemEntryForm`; migrate both organisms; preserve clear/refocus/no-disable UX.
- [x] New unit tests for both molecules (see below).
- [x] Keep existing sheet/organism tests green; trim assertions now covered by molecule tests.
- [x] `npm run validate` clean.
- [ ] `npm run test:e2e` — store switch, aisle re-pick, and add-item (both default
      list and shopping list) flows green.

**Review**: Approved by fresh session. Ready to implement.
