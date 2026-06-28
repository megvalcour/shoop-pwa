# Replace the aisle-spine signature with aisle placards and swipe-to-delete rows

## Status

Superseded by ADR-0023 (signature only)

## The Problem

The shopping list view — worked one-handed while walking a store — reads as busy:
the aisle spine (a vertical rail plus a 26px bordered numbered node per group) and
a persistent red trash button on every row are the loudest non-content elements,
competing for attention against the checklist itself.

## The Solution

Drop the aisle spine and replace it with a single calm **aisle placard** per group
(a small filled `bg-primary` tile carrying the aisle number in the sticky header),
and move row deletion off the persistent trash button onto a hand-rolled
**swipe-left-to-delete** gesture with an accessible fallback button.

## Options Considered

- **Aisle placards + swipe-to-delete** — one placard per aisle header instead of a
  rail + node per group; deletion is a swipe gesture with a keyboard/SR-reachable
  delete button revealed underneath.
- Keep the spine, only drop the trash button — leaves the loudest element (the
  rail + per-group node + `pl-9` indent) in place.
- Keep everything, just restyle quieter — does not remove elements, so the row
  still carries a destructive-colored control mid-shop.

## Rationale

This is a **partial revision of ADR-0020**: it changes **only** that ADR's
*Signature* section (the aisle spine). ADR-0020's monochrome-blue palette,
Nunito typography, and blue-tinted Material elevation **remain in force** and are
not superseded — the placard reuses `--color-primary` / `--color-primary-foreground`
and the swipe-reveal affordance reuses `--color-destructive`; no new colors or
fonts are introduced.

The aisle placard preserves ADR-0020's core meaning — "wayfinding mirrors the
store walk" — as one calm marker per group (like the numbered sign hung over a
real store aisle) rather than a continuous rail with a node on every group. The
aisle number lives in the placard, so the header text drops the redundant
"Aisle N —" prefix and shows just the aisle name. Removing the per-row trash
button and the `pl-9` rail indent lets rows run full width and stops a
destructive control from sitting on every row during the shop.

Swipe-to-delete is hand-rolled with Pointer Events (no new dependency, per the
project's offline-first, minimal-footprint posture). Because a swipe gesture is
not accessible on its own, the revealed delete is a real focusable `<button>`
with an `aria-label`, keeping a non-gesture delete path on the primary surface
for keyboard and screen-reader users.

Per ADR-0005 (atomic design), the gesture lives in a reusable `SwipeableRow`
molecule that wraps existing row content; the `ListItemRow` molecule keeps its
optional trash-button path unchanged for the default-list editor (a sit-down
editing surface, not the in-motion list).

## Notes

Revises the *Signature* section of **ADR-0020** only; that ADR's `Status` is set
to `Superseded by ADR-0022 (signature only)` to point here while keeping its
still-current palette/typography/elevation tokens authoritative. Cites
**ADR-0005** (atomic design component model).

**Signature — aisle placards:** each sticky aisle header for a numbered aisle
leads with a small filled `bg-primary` rounded tile holding the aisle number in
`primary-foreground` (Data role: Nunito 700 `tabular-nums`). Named sections
(non-numeric) and the transient Categorizing / Uncategorized groups show no tile,
only a quiet uppercase muted label. The Done group shows a small check-glyph chip
in place of the placard. The check-off remains the one moment of motion
(`motion-safe:` only); the swipe translate is likewise `motion-safe:`.
