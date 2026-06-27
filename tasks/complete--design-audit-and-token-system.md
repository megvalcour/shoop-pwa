# Design Audit & Token System — Clean Minimal Blue, Material Texture, Nunito

> Status: **Plan only — no code.** Awaiting review before implementation.
> Brief (pinned, non-negotiable): clean & minimal · **material-style texture** · **blue palette** · **Nunito**.

---

## 0. Subject (grounding the design)

Shoop is a **single-user, offline-first PWA** used by one person, on a phone,
**while physically walking a specific store**, one thumb free, in harsh
fluorescent lighting. Its reason to exist: the list is **sorted to match the
store's aisle layout**, so you walk one path and never backtrack. The screen's
single job is **check this item off, fast, in motion**. That spatial-sequence
truth is what the design should express — not "another tidy list app."

---

## 1. Audit of the current UI

Current tokens live in `src/index.css` (`@theme`); identity is governed by
**ADR-0008**, which is already diverged (see §6).

**What's working**
- Blue primary (`#084887`) and Nunito are already in place — the brief is half-met.
- Token mechanism is sound: semantic CSS custom properties → Tailwind utilities. Keep it.
- Cool near-white surfaces (`#FAFBFF`) read clean.

**What's off-brief or weak**

| # | Finding | Why it matters |
|---|---------|----------------|
| 1 | **Orange accent** (`--color-accent #F58A07`, `--color-accent-secondary`) drives active nav, CTAs, selection. | Directly contradicts "blue palette." It's the loudest non-blue thing on screen. |
| 2 | **No elevation language.** Every card is `shadow-sm` on near-white; header/nav are flat fills. | "Material texture" = layered tonal elevation. There's no depth ramp, so nothing reads as Material. |
| 3 | **Type has no scale.** Nunito is loaded 100–900 variable but used as `font-bold` everywhere; titles, items, and labels barely differ. | Nunito's range is the personality lever and it's idle. Hierarchy is flat. |
| 4 | **No signature.** The aisle-grouped list — the entire point of the product — renders as tiny uppercase text via `AisleGroup` (`text-xs sticky top-0`). The "walk the store" metaphor is invisible. | The hero idea isn't expressed anywhere. |
| 5 | `--color-text-muted #909CC2` on white ≈ **3.0:1 contrast** (below WCAG AA 4.5). | Fails accessibility, and washes out under store lighting — the exact use context. |
| 6 | **Radius drift:** `rounded` (badge), `rounded-lg` (card/button/nav), `rounded-t-2xl` (sheet). No shape scale. | Material wants a consistent shape system; minor but reads as unconsidered. |
| 7 | **Small touch targets:** delete/icon buttons are `p-1`. | Used in-aisle, one-thumb, in motion. Below the 48dp comfort target. |
| 8 | **Check-off is the core action** (done dozens of times per trip) but is just `opacity-60` + `line-through`. | Zero feedback/delight on the one interaction that defines the app. |
| 9 | Sticky aisle header is `bg-background` with no edge/shadow; content scrolls under it with no separation. | Visual bug-feel; elevation would fix it for free. |

---

## 2. Direction / thesis

**"Aisle by aisle, top to bottom."** Lean into the one true thing: the list is
a **vertical path through the store**. Express Material's "texture" as **tonal
elevation done in blue** — a quiet stack of paper surfaces that lighten as they
rise, with shadows tinted toward the palette rather than neutral gray. Spend the
single bold move on a wayfinding **aisle spine** that mirrors the shopper's walk.
Everything else stays disciplined and minimal.

Decision that resolves the brief conflict: go **monochrome-blue**, and let
**elevation + a single bright azure** do the work the orange used to do. One
fewer color, cleaner, on-brief. (Red is retained for destructive only.)

---

## 3. Token system

### 3a. Color — blue tonal palette, elevation-as-accent

A single key blue, expanded into a Material-style tonal ramp. Elevation is
expressed as **tonal tint + a blue-tinted shadow**, not as gray drop-shadows —
that palette-colored shadow is a deliberate, non-default detail.

| Token | Hex | Role |
|---|---|---|
| `--color-ink` | `#082B5C` | Deepest blue — display headings, app-bar text in dark contexts |
| `--color-primary` | `#0B4DA2` | Primary chrome (app bar, bottom nav), FAB, key actions |
| `--color-accent` | `#2E72D2` | **The** interactive accent (active nav, selection, links) — replaces orange |
| `--color-primary-foreground` | `#EAF2FF` | Text/icons on primary blue |
| `--color-tint` | `#DCE8FA` | Tonal surface tint: selected rows, filled aisle nodes, raised tonal blocks |
| `--color-surface` | `#EEF4FD` | Page background (elevation 0) — cool haze, not pure white |
| `--color-card` | `#FFFFFF` | Resting card (elevation 1) |
| `--color-text` | `#0E1726` | Body text |
| `--color-text-muted` | `#51617E` | Secondary text — **darkened to ≥4.5:1 on white** (fixes audit #5) |
| `--color-border` | `#CBD8EF` | Hairline dividers |
| `--color-destructive` | `#C0392B` | Delete / error only (the one non-blue, used sparingly) |

**Elevation ramp** (the "material texture" — blue-tinted shadows):

| Token | Value | Used by |
|---|---|---|
| `--shadow-1` | `0 1px 2px rgb(8 43 92 / 0.08)` | Resting item cards |
| `--shadow-2` | `0 2px 8px rgb(8 43 92 / 0.12)` | Pinned aisle header, app bar, bottom nav |
| `--shadow-3` | `0 8px 24px rgb(8 43 92 / 0.18)` | FAB, bottom sheet, dialog |

### 3b. Type — Nunito, one family, three roles via weight + numerals

Brief pins a single typeface, so roles come from Nunito's variable weight axis
and OpenType numerals rather than a second face — disciplined, not generic.

| Role | Treatment | Used for |
|---|---|---|
| **Display** | Nunito **800**, tracking `-0.01em` | Screen titles, store name |
| **Label / eyebrow** | Nunito **700**, `12px` uppercase, tracking `+0.08em` | Aisle headers ("AISLE 4 · DAIRY") |
| **Body (workhorse)** | Nunito **600**, `16px` | Item names — legible at a glance, in motion |
| **Caption** | Nunito **500**, `13px`, muted | Dates, secondary meta |
| **Data** | Nunito **700**, `tabular-nums` | Quantities, counts, aisle numbers — numbers align in a column |

Type scale (mobile): Display 24/30 · Title 18/24 · Body 16/22 · Label 12/16 ·
Caption 13/16. The `tabular-nums` "data" role is the third utility role realized
through an OpenType feature instead of importing another font.

### 3c. Layout — the store as a vertical path

The list is a journey *down* the store. A thin **aisle spine** runs down the
left edge with a circular **numbered node** at each aisle (a transit-line /
store-map motif). Items hang to the right as resting cards. As an aisle's items
get checked, its node fills with `--color-tint` and a progress fill travels down
the spine — the screen literally mirrors how far through the store you are.
Numbered markers are *earned* here: aisle numbers are a real sequence the
shopper follows (the skill's caution against decorative `01/02/03` doesn't apply).

```
┌───────────────────────────────┐
│ ▢ Tesco Oxford      ▼     [≡] │  app bar — primary blue, shadow-2
├───────────────────────────────┤
│ ④─ AISLE 1 · PRODUCE          │  station marker: numbered node on spine
│ │  ┌─────────────────────────┐│
│ │  │ Bananas            6  ☐ ││  item card — card / shadow-1
│ │  └─────────────────────────┘│
│ │  ┌─────────────────────────┐│
│ │  │ Spinach          1 bag ☐││
│ │  └─────────────────────────┘│
│ ⑦─ AISLE 4 · DAIRY            │
│ │  ┌─────────────────────────┐│
│ │  │ Milk            2 pts ☐ ││
│ │  └─────────────────────────┘│
│ ◉─ DONE · 3                   │  filled node (tint), progress complete
│ ╎  ┌─────────────────────────┐│
│ ╎  │ ̶B̶r̶e̶a̶d̶            1  ☑ ││  checked: sunken, desaturated
│ ╎  └─────────────────────────┘│
│                          ( + )│  FAB — primary, shadow-3
├───────────────────────────────┤
│   🛒 Shop          ⚙ Settings │  bottom nav — primary, shadow-2
└───────────────────────────────┘
```

Shape scale: cards/buttons `12px`, nodes/FAB full-round, sheets `20px` top.
Touch targets ≥ 44px (fixes audit #7).

### 3d. Signature

**The aisle spine.** A continuous vertical track with a numbered node per aisle
that fills as you clear that aisle, with a progress fill descending the spine as
you shop. It's the one memorable element, and it encodes something *true* — the
ordered walk through the store and your position along it — rather than
decorating the layout. The single moment of motion is the **check-off**: the row
sinks one elevation level and desaturates while its aisle node ticks toward
filled. Everything else stays still and quiet.

---

## 4. Self-critique (vs. a generic "Material + blue + Nunito" brief)

A default pass would yield: white cards, an indigo/teal *secondary* accent, a
plain FAB, neutral gray shadows, flat aisle text. Deliberate departures here:

- **Blue-tinted shadows** (palette-colored elevation), not neutral gray — specific to this palette.
- **Monochrome-blue, elevation-as-accent** instead of the reflexive "primary + bright secondary" — a real choice that also resolves the orange/brief conflict.
- **Aisle spine wayfinding** derived from the product's actual spatial-sorting purpose — fully subject-specific, un-templatable.
- **Three type roles from one Nunito** (weight + `tabular-nums`) instead of bolting on a second face — honors the single-font brief.

Risk taken & justified: the spine/progress metaphor. Justified because ordering
the list to the store's physical path *is* the product — visualizing it is the
design stating the thesis. Chanel edit (remove one thing): the orange accent is
dropped entirely, not rebalanced.

---

## 5. Open decision for review

- **Strictly monochrome-blue (recommended)** vs **blue + one warm spark**. I
  recommend monochrome — cleaner, fully on-brief, elevation carries emphasis. If
  a single warm "success/done" spark is wanted instead, it would live only on the
  filled aisle node. Flag preference before build.

## 6. Constraints the build must honor

- **ADR-0008 is immutable.** It documents the (now-stale) green jewel-tone
  identity. Per `AGENTS.md`, do **not** edit an accepted ADR's body. This redesign
  must ship a **new superseding ADR** (e.g. `0020-blue-material-visual-identity.md`)
  recording this palette/type/elevation system, and set ADR-0008's `Status:` to
  `Superseded by ADR-0020`. PLAN.md already tracks this divergence.
- **Tokens only in `@theme`** (`src/index.css`) — no raw hex or one-off font
  stacks in components (ADR-0008 mechanism stands).
- **Accessibility floor:** muted text ≥ 4.5:1, visible keyboard focus, ≥44px
  targets, `prefers-reduced-motion` respected (no spine animation when set).
- **Offline-first:** purely presentational; no network in any critical path.

## 7. Phased implementation outline (when approved — not started)

1. **Tokens:** rewrite `@theme` in `src/index.css` (palette, shadow ramp, weights); drop orange tokens.
2. **Atoms:** Button/Badge/Icon to new tokens + shape scale + larger targets.
3. **Elevation pass:** cards → `shadow-1`, app bar / nav / sticky header → `shadow-2`, FAB / sheets → `shadow-3`.
4. **Type pass:** apply display/label/body/data roles across organisms.
5. **Signature:** rebuild `AisleGroup` / `ShoppingListBuilder` with the aisle spine + numbered nodes + check-off micro-interaction.
6. **ADR:** write `0020`, supersede `0008`; update `PLAN.md`.
7. **Verify:** `npm run validate` + `npm run test:e2e` (UI/gesture changes can pass validate and still break E2E).
