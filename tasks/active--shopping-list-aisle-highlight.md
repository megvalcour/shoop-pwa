# Highlight the aisle number in the shopping list view

## Goal

Make the **aisle number** the most prominent piece of wayfinding in the
shopping list view. In the store you navigate by number; the UI should let you
glance and find it instantly.

## Current state

In the shopping list (`ShoppingListBuilder` → `AisleGroup`), the aisle number
lives only in the 26 px circular "station node" on the aisle spine, rendered at
`text-[11px]` (`AisleGroup.tsx:38-53`). The aisle **label** is what actually
gets visual weight — it's the 12 px uppercase bold header text beside the node.
So today the number — the single most useful datum when you're physically in the
aisle — is the quietest thing on the row.

Confirmed the number has no other home: `GroceryListItem` shows only the aisle
*label* per item (`aisleLabel`, never the number), so the spine node is the one
place the number appears. Amplifying that node is the direct, minimal lever.

## Design constraints (ADR-0020, monochrome-blue + aisle-spine signature)

- Stay monochrome blue; emphasis comes from **elevation and the spine**, not a
  new accent hue. The bright `--color-accent` spark is reserved (it already
  marks the `done` node).
- Numbers are the **Data** type role: Nunito **700**, `tabular-nums`. Keep that —
  enlarge the numeral, don't change its weight ramp.
- Tokens only, no raw hex. Reuse `--color-primary`, `--color-tint`,
  `--color-primary-foreground`.
- Keep it minimal: amplify the existing node; do not add a second number element
  or a competing badge.

## Approach — amplify the station node (recommended)

Grow the spine's `aisle`-variant node so the numeral reads as the hero, and lift
it off the spine with a subtle tonal fill. Outlined-but-bigger keeps the calm,
minimal feel while making the number unmistakable. Only the `aisle` variant
changes; `muted` (dot) and `done` (check) nodes are untouched.

### Changes in `src/components/molecules/AisleGroup.tsx`

1. **Enlarge the node** for the `aisle` variant: `h-[26px] w-[26px]` →
   `h-9 w-9` (36 px). Numeral `text-[11px]` → `text-[15px]` (or `text-base`),
   keeping `font-bold tabular-nums` (Data role).
2. **Lift it off the spine**: give the numeric node a `bg-tint` fill (the token
   meant for "filled nodes") instead of `bg-card`, keeping `border-primary
   text-primary`. This makes each number a small solid blue-tinted chip riding
   the spine, so the column of numbers is the first thing the eye catches.
3. **Re-center the geometry** so the bigger node still sits on the spine:
   - Node: `left-1` → `left-0` (36 px node at left-0 centers on 18 px).
   - Spine: `left-[17px]` stays (centerline ~18 px).
   - Section padding: `pl-9` → `pl-11` (44 px) so item rows clear the wider node.
   - Header: `-ml-9 … pl-9` → `-ml-11 … pl-11` to match the new section padding.
   - Verify the sticky header node still vertically centers (`top-1/2
     -translate-y-1/2`) and the `muted`/`done` nodes (still 26 px) stay aligned
     to the same spine centerline — either bump them to 36 px too for a
     consistent track, or keep them small; pick whichever keeps the spine
     visually continuous. **Recommendation:** size all three nodes to 36 px so
     the track reads as one rail; the dot/check just sit in a larger ring.

### No changes needed elsewhere

- Header text logic in `ShoppingListBuilder.tsx:102-113` already shows the label
  only for numeric aisles (the number is the node), so there's no duplication to
  remove and no per-row change.
- `formatAisleLabel` unchanged.

## Bolder alternative (only if "more" should mean loud)

Solid-fill the numeric node: `bg-primary text-primary-foreground` (drop the
border). Each aisle becomes a solid blue number chip — maximum prominence, still
monochrome. Trade-off: louder and slightly less calm than the tinted version,
and visually closer to the FAB/primary-action language. Left as a one-line toggle
in the same `className`; default to the tinted version above given the
minimal-design preference.

## Testing

- Extend `src/components/molecules/__tests__/AisleGroup.test.tsx`: add a case
  asserting the `marker` number renders (e.g. `marker="7"` → `getByText('7')`)
  and that `muted`/`done` variants render their dot/check instead. The existing
  header/children tests stay green.
- `npm run validate` (typecheck + lint + Vitest).
- Manual/visual check via `npm run dev` on a list with numeric aisles; confirm
  the spine stays continuous and rows align. Optionally a screenshot through the
  `run` skill.
- E2E: this is a pure styling/geometry change to one molecule; run
  `npm run test:e2e` to confirm no shopping-flow selectors broke (CI gates on it
  per ADR-0018).

## Out of scope

- Per-row aisle-number display, sorting changes, or any data-model work.
- Touching `muted`/`done` node semantics beyond size alignment.

## Commit

Conventional Commits. This is presentation-only (no `DB_VERSION` change):
`style: amplify aisle-number station node in shopping list` (or `feat:` if we
decide the enlarged spine is a user-facing feature — confirm with user before
committing).
