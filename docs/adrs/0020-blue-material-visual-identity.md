# Adopt a monochrome-blue, Material-elevation visual identity with Nunito

## Status

Accepted

## The Problem

The app's documented visual identity (ADR-0008: warm green jewel-tone, Playfair
Display + DM Sans) no longer matches the shipped UI, and the shipped UI itself
mixed a blue chrome with an orange accent and had no depth or signature.

## The Solution

Adopt a clean, minimal **monochrome-blue** identity where Material-style
elevation (blue-tinted shadows over tonal surfaces) carries emphasis, set
entirely in **Nunito**, with an **aisle-spine** wayfinding signature for the
shopping list.

## Options Considered

- **Monochrome-blue + elevation-as-accent, Nunito, aisle-spine signature** — one
  key blue expanded into a tonal ramp; depth (not a contrasting hue) signals
  emphasis; the list renders as a vertical path through the store.
- Keep blue chrome + orange accent — off-brief (a blue-palette brief), and the
  orange was the loudest non-blue element on screen.
- Restore ADR-0008's green jewel-tone + serif pairing — contradicts the
  blue/Nunito brief and the shipped direction.

## Rationale

A single-user, in-aisle, in-motion grocery app wants legibility and calm, not a
second competing accent. Expressing emphasis through Material elevation keeps the
palette monochrome and on-brief while still giving clear hierarchy. The aisle
spine is derived from the product's one true idea — the list is ordered to the
store's physical layout — so the signature encodes the shopper's path rather than
decorating it. Nunito's variable weight axis supplies display/label/body/data
roles from a single self-hosted family, honoring the single-font brief.

## Notes

Supersedes ADR-0008 (its CSS-custom-properties-in-`@theme` token *mechanism*
still stands; only its palette/typography identity is replaced). Tokens remain
the single source of truth in `src/index.css`; no raw hex or one-off font stacks
in component files.

**Palette (monochrome blue):**

| Token | Value | Role |
|---|---|---|
| `--color-ink` | `#082B5C` | Deepest blue: display headings, station nodes |
| `--color-primary` | `#0B4DA2` | Primary chrome (app bar, nav), FAB, key actions |
| `--color-primary-foreground` | `#EAF2FF` | Text/icons on primary blue |
| `--color-accent` | `#6FA8FF` | The one bright spark: active nav, reads on deep blue |
| `--color-tint` | `#DCE8FA` | Tonal surface tint: checked rows, filled nodes |
| `--color-destructive` | `#C0392B` | Delete / error only |
| `--color-surface` / `--color-background` | `#EEF4FD` | Page background (elevation 0) |
| `--color-card` | `#FFFFFF` | Resting card (elevation 1) |
| `--color-text` | `#0E1726` | Body text |
| `--color-text-muted` | `#51617E` | Secondary text (≥4.5:1 on white, WCAG AA) |
| `--color-border` | `#CBD8EF` | Hairline dividers |

**Elevation (blue-tinted shadows, Material "texture"):**

| Token | Value | Role |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(8 43 92 / 0.08)` | Resting cards |
| `--shadow-raised` | `0 2px 8px rgb(8 43 92 / 0.12)` | App bar, bottom nav, pinned headers |
| `--shadow-float` | `0 8px 24px rgb(8 43 92 / 0.18)` | FAB, bottom sheets, dialogs |

**Typography (one family, role via weight + numerals):**

| Role | Treatment | Used for |
|---|---|---|
| Display | Nunito 800, tracking `-0.01em` | Screen titles, store name |
| Label | Nunito 700, 12px uppercase, tracking `+0.08em` | Aisle headers |
| Body | Nunito 600, 16px | Item names |
| Caption | Nunito 500, muted | Dates, secondary meta |
| Data | Nunito 700, `tabular-nums` | Quantities, counts, aisle numbers |

**Signature — the aisle spine:** a vertical track down the shopping list with a
numbered node per aisle (wayfinding that mirrors the store walk) and a filled
completion node at the bottom. The one moment of motion is the check-off
(`motion-safe:` only): the row drops an elevation level and desaturates.
