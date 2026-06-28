# Inline "Aisle N — Label" headers, refined swipe-to-delete reveal

## Status

Accepted

## The Problem

The aisle-placard signature (ADR-0022) leads each numbered aisle header with a
small filled `bg-primary` tile holding the aisle number, with the header text
dropping the "Aisle N —" prefix. In use the placard reads like a **count** (a
badge of how many items are in the aisle) rather than wayfinding, and stripping
the prefix leaves a bare name with no spoken cue that it is an aisle number.

A second, smaller issue rides on the same view: the swipe-to-delete affordance
(also ADR-0022) renders its `bg-destructive` layer as a right-pinned 88px slab
that is present at rest. Around the row's `rounded-xl` corners the red bleeds
into view even when no swipe is in progress, reintroducing exactly the
"destructive control sitting on every row" that ADR-0022 set out to remove.

## The Solution

Drop the number placard and head each numbered aisle inline as
`Aisle N — Label`, produced by the existing `formatAisleLabel` single source of
truth. Refine the swipe affordance so its red layer is full-bleed behind the row
and is only **visible while a swipe is in progress** (or the fallback delete
button is focused); at rest no red shows, and the row clips its corners
unconditionally so nothing pokes past `rounded-xl`.

## Options Considered

- **Inline `Aisle N — Label` headers + reveal-only red** — the number lives in
  the spoken label, no tile competes for attention, and the destructive color
  only appears as a direct response to the gesture.
- Keep the placard, restyle it quieter — does not fix the "reads like a count"
  ambiguity; a filled tile in the header still looks like a badge.
- Keep the placard, add the prefix back to the header too — redundant: the
  number would appear twice.
- Leave the swipe red as a pinned slab — leaves a destructive-colored sliver on
  every row at rest, the very thing ADR-0022 removed.

## Rationale

This **supersedes the *Signature — aisle placards* section of ADR-0022 only.**
ADR-0022's swipe-to-delete *decision* (deletion is a swipe gesture with an
accessible fallback button, hand-rolled with Pointer Events, no new dependency)
remains in force — this ADR only *refines* how that affordance is revealed,
serving ADR-0022's own stated goal of keeping a destructive control off every
row during the shop. ADR-0020's monochrome-blue palette, Nunito typography, and
blue-tinted Material elevation remain authoritative and are untouched; no new
colors, fonts, tokens, components, or dependencies are introduced.

`formatAisleLabel` already emits `Aisle N — Label` (em dash) for numbered aisles
and the bare label for named/non-numeric sections, so the header reuses the
canonical label path; `ShoppingListBuilder` no longer special-cases numeric
aisles. Per ADR-0005 (atomic design), the changes stay within the existing
`AisleGroup` and `SwipeableRow` molecules and the `ShoppingListBuilder` organism.

**Signature — inline aisle headers:** each sticky aisle header for a numbered
aisle shows a single quiet uppercase label `Aisle N — Label` (no filled tile).
Named sections and the transient Categorizing / Uncategorized groups show the
same quiet uppercase label (muted/italic). The Done group keeps its small
check-glyph chip. The swipe-reveal destructive layer (`--color-destructive`)
spans the full row width behind the foreground, is clipped to `rounded-xl`, and
is shown only while the row is `open` (a swipe is in progress or the fallback
delete button is focused) via a `motion-safe:` opacity transition; at rest it is
fully transparent. The fallback delete `<button>` stays mounted and focusable at
all times for keyboard and screen-reader users. The check-off remains the one
moment of motion (`motion-safe:` only); the swipe translate is likewise
`motion-safe:`.

## Notes

Supersedes the *Signature — aisle placards* section of **ADR-0022** only; that
ADR's `Status` is set to `Superseded by ADR-0023 (signature only)` to point here
while keeping its swipe-to-delete decision and its references to ADR-0020's
still-current tokens authoritative. Cites **ADR-0005** (atomic design),
**ADR-0020** (visual identity tokens), and **ADR-0022** (swipe-to-delete
decision).
