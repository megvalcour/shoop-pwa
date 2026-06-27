# Use CSS custom properties as design tokens with a warm jewel-tone visual identity

## Status

Superseded by ADR-0020

## The Problem

The app needs a coherent visual language that all components can reference, defined once and not scattered across Tailwind utility classes.

## The Solution

Define design tokens as semantically-named CSS custom properties in Tailwind v4's `@theme` block in `src/index.css`, surfaced automatically as utility classes, as the single source of truth for the app's visual identity.

## Options Considered

- **CSS custom properties in `@theme` (Tailwind v4) with semantic names** — tokens defined in `src/index.css`, surfaced as Tailwind utilities automatically; single source of truth
- Hardcoded Tailwind color classes per component — fast to start but brittle; color changes require grep-and-replace across every file
- A JS theme object (e.g., passed via React context) — flexible but adds runtime overhead and couples components to a provider

## Rationale

Tailwind v4's `@theme` block maps CSS custom properties directly to utility classes (`bg-primary`, `text-accent`, etc.) with no extra plugin. Defining tokens once in `index.css` means every component inherits them through utilities — no provider, no runtime cost, no drift between design intent and class names. Semantic names (`--color-accent`, not `--color-orange-500`) decouple the palette from the implementation so the palette can be swapped without touching component files.

## Notes

**Palette (as of app shell):**

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#1B3A2D` | Nav background, primary chrome |
| `--color-primary-foreground` | `#A8C5B8` | Icons/text on primary background |
| `--color-accent` | `#D4783A` | Active states, CTAs |
| `--color-destructive` | `#8B1C3A` | Delete, error states |
| `--color-surface` | `#F9F3E8` | Page background |
| `--color-text` | `#1C1814` | Body text |
| `--color-text-muted` | `#7A6A5A` | Secondary text on light background |

**Typography:**

| Token | Value | Role |
|---|---|---|
| `--font-display` | Playfair Display 700, self-hosted WOFF2 | Screen titles, headings |
| `--font-body` | DM Sans 400/500, self-hosted WOFF2 | All UI text |

New tokens must be added to `src/index.css` under `@theme`. Do not introduce raw hex values or one-off font stacks in component files.
