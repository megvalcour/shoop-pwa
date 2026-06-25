## Current Status

feat: Recipe Import Phase 2 — serverless fetch/parse function (`/api/import-recipe`)

## Active Task

None.

## Backlog

### Recipe Import · Phase 3 — Client data hook + ingredient normalization

The TanStack Query hook that calls the function, plus the pure normalizer that
cleans raw ingredient strings into addable item names.

- Plan: `tasks/active--recipe-import.md` (Steps 3–4)
- Scope: `src/hooks/useRecipeImport.ts` (`useQuery` enabled only on a valid URL;
  sends the `X-Shoop-Import` token from `VITE_IMPORT_TOKEN`; maps 400/401/422/502
  to typed error states); `src/lib/normalizeIngredient.ts` (strip leading
  quantity incl. unicode fractions/ranges, strip leading unit token, strip
  trailing prep clauses, conservative raw-string fallback); document
  `VITE_IMPORT_TOKEN` in `.env.example` (empty value); unit tests for both.
- Depends on: Phase 2 (endpoint JSON contract).
- Done when: `useRecipeImport` + `normalizeIngredient` unit tests green
  (fetch mocked); `npm run validate` green.

### Recipe Import · Phase 4 — Import screen & entry points

The `/import` route, the `RecipeImporter` organism, the target picker, and a
manual paste entry point so the feature works on iOS/desktop without share.

- Plan: `tasks/active--recipe-import.md` (Steps 5–6)
- Scope: add `{ path: 'import', element: <ImportRecipeRoute /> }` under
  `AppShell` in `App.tsx`; `src/routes/ImportRecipeRoute.tsx` (derive URL from
  `url` param, else first `https?://` token in `text`; manual-paste empty
  state); `src/components/organisms/RecipeImporter.tsx` (loading/error/empty
  states, ingredient checklist, target picker for New/Existing/Default list,
  commit via existing `useCreateShoppingList` / `useAddListItem` / default-list
  hooks then navigate); a manual "Import from recipe" entry point (NewListFab
  menu or Settings). Reuse audit first: `Checkbox`, `Button`, `Input`,
  `SelectionList`, `ItemEntryForm`/`EditableTitle`, shared modal/bottom-sheet
  primitives.
- Depends on: Phase 3 (hooks) and Phase 1 (share_target target route).
- Done when: component/route unit tests green (hooks mocked); manual flow
  reaches a list with items; `npm run validate` green.

### Recipe Import · Phase 5 — E2E, validate & ship

End-to-end coverage, full validation, and task close-out.

- Plan: `tasks/active--recipe-import.md` (Steps 7, 8; note 7.5 is manual
  dashboard config, not code).
- Scope: `e2e/recipe-import.spec.ts` (navigate to `/import`, intercept and mock
  `/api/import-recipe`, assert ingredients render, commit to a new list, land on
  the list with items); run `npm run validate`, `npm run test:e2e`, and
  `npm run build` (confirm `share_target` in emitted manifest); document the
  Step 7.5 Cloudflare dashboard steps (`IMPORT_TOKEN`/`VITE_IMPORT_TOKEN`
  binding, per-IP rate-limit rule) in `docs/releases.md`; on completion update
  `PLAN.md` and rename the plan to `tasks/complete--recipe-import.md`.
- Depends on: Phases 1–4.
- Done when: CI green (validate + E2E); manifest check passes; task moved to
  complete.

### Reconcile Diverged ADR (0008)

One accepted ADR has drifted from the codebase. A new superseding ADR is needed (and a `Status: Superseded by ADR-NNNN` edit on the old one).

- **ADR-0008 (design tokens / visual identity)** — The token _mechanism_ (CSS custom properties in Tailwind v4 `@theme`) still holds, but the documented identity is wrong. Title says "warm jewel-tone"; current `src/index.css` uses blue `--color-primary: #084887` (ADR: green `#1B3A2D`), `--color-accent: #F58A07` (ADR: `#D4783A`), and `Nunito` for both display and body fonts (ADR: Playfair Display + DM Sans). New ADR should record the current palette/typography and supersede 0008's identity table.

Lower-priority stale _notes_ (no new ADR required; fix in place if/when touched): ADR-0005 references nonexistent `WeeklyListBuilder` (now `ShoppingListBuilder`); ADR-0011 references `oxford-62-aliases.json` (now `src/services/aisleAliases.ts`); ADR-0012's note "`useActiveStore` returns `stores[0]`, multi-store deferred" is superseded by ADR-0015 (Store Switcher now exists).

### Documentation Audit

- Update the readme to align with the current project. Include links to other documents as needed (such as releases.md)

### Grocery List Item Quantities

- Allow users to add/edit quantities on grocery list items (e.g., "2 lbs", "3 cans").
- Plan: `tasks/backlog--grocery-item-quantities.md`

### Unit Test Audit

- Review unit tests related to components (atoms, molecules, organisms). Ensure that tests do not rely heavily on mocks and that components are small, testable units.

### E2E Audit

- Audit existing E2E tests and harden/expand coverage.

### Sharing

- Users can share their lists with another device/user; need a solution that works with our PWA/IndexedDB only storage tech stack.

### Research Mode

- Need way to populate stores without public aisle/inventories available.
