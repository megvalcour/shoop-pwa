# Declutter the shopping list view ("the quiet list")

## Goal

Make the shopping list view feel less busy while staying polished. Remove the
aisle spine + numbered nodes and the persistent per-row trash button — the two
loudest non-content elements — and replace the spine signature with a calmer
"aisle placard" marker.

## Brief & subject (frontend-design)

Shoop is a single-user, in-aisle, in-motion grocery app. The list view's one
job: a glanceable, store-ordered checklist you work one-handed while walking.
Calm and legible beats decorated. The enemy is visual noise competing for
attention while moving.

Diagnosed sources of busyness:

1. **Aisle spine** (`AisleGroup`) — a vertical rail + a 26px bordered numbered
   node per group, plus a `pl-9` indent down the whole list. Loudest non-content
   element.
2. **Redundant aisle number** — shown in the node *and* again in the header
   label via `formatAisleLabel` ("Aisle 3 — Produce").
3. **Persistent red trash button** on every row — destructive-colored, rarely
   used mid-shop.
4. (Aisle-swap ⇄ badge on every row — kept but de-emphasized; see below.)

## Confirmed decisions

- **Cards:** keep per-item cards **with** their resting shadow (unchanged).
- **Spine:** removed entirely.
- **Signature → aisle placards:** a small filled `bg-primary` rounded tile
  holding the aisle number in `primary-foreground` (Data role: Nunito 700
  `tabular-nums`), leading each sticky aisle header — like the numbered sign over
  a real store aisle. Preserves ADR-0020's "wayfinding mirrors the store walk"
  meaning as one calm marker per group instead of a rail + node per group.
- **Aisle-swap badge:** kept, **de-emphasized** (smaller, muted, lower
  contrast) so it stops competing on every row. No new gesture.
- **Delete:** **swipe-left-to-delete**, **hand-rolled** with Pointer Events (no
  new dependency).

## Design tokens (unchanged — ADR-0020 stays in force)

Monochrome blue palette, Nunito, blue-tinted Material elevation. No new colors
or fonts. The placard uses `--color-primary` / `--color-primary-foreground`;
the swipe-reveal delete affordance uses `--color-destructive`.

## ADR requirement (blocking)

Removing the spine contradicts **ADR-0020**, which names the aisle spine as the
app's signature. ADRs are immutable, so this needs a new ADR:

- **Create `docs/adrs/0022-aisle-placard-signature.md`** documenting the new
  signature (aisle placards) and the swipe-to-delete interaction. It revises
  **only** ADR-0020's *Signature* section; ADR-0020's palette, typography, and
  elevation remain in force.
- Set **ADR-0020 `Status`** to `Superseded by ADR-0022 (signature only)` — the
  one permitted edit to an accepted ADR. ADR-0022's body states the partial
  scope explicitly so ADR-0020's still-current tokens are not read as dead.

## Implementation

### 1. ADR-0022 (docs)
New ADR per above. Cite ADR-0020 and ADR-0005 (atomic design).

### 2. `AisleGroup` molecule — drop the spine, render a placard
- Remove the `<span>` spine track and the absolutely-positioned 26px station
  node. Remove the `relative pl-9` indent so rows go full width.
- Numbered aisle (`marker` is numeric): render the placard tile + header label.
- `variant="muted"` (Categorizing / Uncategorized) and named sections: no tile,
  quiet uppercase muted label (italic stays for muted).
- `variant="done"`: a quiet "Done · N" header with a small check glyph chip in
  place of the placard (no rail, no filled completion node).
- Keep the sticky header behavior + `tracking-wider uppercase` Label type.

### 3. `ShoppingListBuilder` organism — kill the redundant number
- For numbered aisles, pass the header text as just the aisle **name**
  (`aisle.label`), since the placard now carries the number. Keep
  `formatAisleLabel` untouched (still the single source of truth, used by
  `AislePickerSheet` and tests); only the builder's header text changes for the
  numbered case. Non-numeric aisles still use `formatAisleLabel`.

### 4. New `SwipeableRow` molecule — hand-rolled swipe-to-delete
- Pointer Events wrapper around row content: track horizontal drag, `translateX`
  the foreground, reveal a `bg-destructive` delete affordance underneath on
  left-swipe. Past a threshold → fire `onDelete` (optimistic via existing hook);
  below → snap back. `motion-safe:` transitions only (respect reduced motion).
- **Tap vs drag:** a small movement threshold distinguishes a swipe from a tap
  so `onToggle` (check-off) never fires after a swipe.
- **a11y:** the revealed delete is a real focusable `<button>` with an
  `aria-label`, reachable by keyboard/screen reader (swipe alone is not
  accessible). This keeps a non-gesture delete path on the primary surface.

### 5. `GroceryListItem` molecule — wire swipe + quiet the badge
- Wrap the row in `SwipeableRow` and pass `onDelete` there; **stop** passing
  `onDelete` to `ListItemRow` (so its trash button does not render in the
  shopping flow).
- De-emphasize the aisle-swap badge: smaller, muted, lower-contrast variant
  (use Badge `muted` + tighter sizing; the ⇄ icon stays). "Categorize" and the
  categorizing spinner badge behavior unchanged.

### 6. `ListItemRow` molecule — leave the button path intact
- No behavior change to the existing optional `onDelete` trash button — it stays
  for `DefaultListEditor` (a sit-down editing surface, not the in-motion list).
  Shopping flow simply stops passing `onDelete` here.

### 7. (Optional) `Badge` atom
- Add a quieter size/variant only if the existing `muted` variant + className
  can't get the de-emphasized swap badge subtle enough.

## Tests

- **Unit:** update `AisleGroup.test.tsx` (no spine/node; placard present for
  numeric, absent for muted/done), `GroceryListItem.test.tsx` (no row trash
  button in shopping flow; swipe delete path; quieter badge),
  `ShoppingListBuilder.test.tsx` (header text no longer includes "Aisle N —").
  Add `SwipeableRow.test.tsx` (drag threshold → onDelete; small move → onToggle
  not suppressed; reduced-motion). `ListItemRow.test.tsx` and
  `DefaultListEditor.test.tsx` should remain green (button path unchanged).
- **E2E (not covered by `npm run validate`):** add a swipe-to-delete spec; audit
  `e2e/general-store.spec.ts` and `e2e/smart-aisle-location.spec.ts` for any
  reliance on the trash button / spine and update. Run `npm run test:e2e`.

## Risks / watch-outs

- CSS specificity when removing `pl-9`/`relative` — verify sticky header offsets
  and that section spacing (`gap-4`) still reads cleanly without the rail.
- Swipe must not eat vertical scroll (lock to horizontal intent past threshold).
- a11y delete path is a hard requirement, not a nice-to-have.
- `npm run validate` will pass without exercising the gesture — E2E is the gate.

## Commit plan (Conventional Commits)

- `docs: add ADR-0022 aisle-placard signature (supersedes ADR-0020 signature)`
- `feat: swipe-to-delete shopping list rows` (new user-facing capability)
- `refactor: replace aisle spine with placard headers` (+ badge de-emphasis)
- (tests folded into the relevant commits)

No `DB_VERSION` bump, so no `feat`-gated migration.
