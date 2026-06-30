# Scope the Eat green sub-theme with a `data-theme="eat"` attribute on the app-shell root, keyed off the active route

## Status

Accepted

## The Problem

The Eat tab should present a green identity while the rest of the app keeps ADR-0020's in-force monochrome-blue, with no global theme toggle and without forking the component layer.

## The Solution

A parallel green token ramp defined under a `[data-theme="eat"]` selector in `src/index.css`, activated by setting `data-theme="eat"` on the app-shell root element whenever the active route is under `/eat`, and removed otherwise.

## Options Considered

- **`data-theme` attribute on the shell root + scoped CSS-custom-property overrides** — selected.
- A second React context/provider that swaps inline style values — rejected: bypasses the token system (ADR-0008/0020), pushes palette logic into JS, and would have to thread through every component to reach chrome like the nav and header.
- A per-route `<div>` wrapper that carries the green theme — rejected: the bottom nav and `StoreHeader` chrome live *outside* the route `<Outlet>` (in `AppShell`), so a wrapper inside the route would leave the chrome blue and only retheme the page body.

## Rationale

The `@theme` CSS-custom-property mechanism was deliberately preserved across the 0008 → 0020 identity change (ADR-0020 supersedes 0008's palette but explicitly keeps its token *mechanism*). That is exactly what makes a scoped sub-theme cheap: a `[data-theme="eat"]` block that redefines the palette/elevation custom properties cascades to every descendant of the element carrying the attribute, with zero changes to any component that already consumes the tokens.

Setting the attribute on the **app-shell root** — the common ancestor of both the route `<Outlet>` and the chrome (`StoreHeader`, bottom `nav`) — is what makes the chrome retheme along with the page. The Eat epic flagged this as the thing to verify; placing the attribute at the shell root rather than inside the route is the structural answer.

The attribute is **driven by the active route** (the shell already reads `useLocation`): under `/eat` it is `"eat"`, elsewhere it is absent and the default `@theme` blue applies. This gives automatic revert-on-leave with no global state, honoring "section-scoped, not a global switch."

## Notes

**Mechanism sketch (implemented in Phase 1, not Phase 0):**

```css
/* src/index.css — default @theme stays blue (ADR-0020). */
[data-theme='eat'] {
  --color-primary: /* green ramp key */;
  --color-accent:  /* green spark */;
  --color-tint:    /* green tonal surface */;
  --color-ink:     /* deepest green */;
  /* shadows re-tinted green to match the elevation-as-accent system */
  --shadow-raised: 0 2px 8px rgb(/* green */ / 0.12);
  /* …only the tokens that carry hue; structural tokens (text, border) reused or lightly shifted */
}
```

```tsx
// AppShell already has useLocation(); add:
const isEat = location.pathname.startsWith('/eat');
// on the shell root <div>:
<div data-theme={isEat ? 'eat' : undefined} className="flex flex-col h-svh">
```

**Constraints carried forward (not resolved here — this ADR fixes the *mechanism*, not the final hex values):**
- **WCAG AA contrast** must be re-verified on the green ramp (`--color-text-muted` ≥ 4.5:1, `--color-primary-foreground` on green chrome, active-nav `--color-accent` on the green nav bar). Final green hex selection + contrast audit lands in Phase 1 implementation and the Phase 6 accessibility pass.
- **Reduced-motion** is already a project convention (`motion-safe:`); the Phase 5 scoring visualization must honor it.

**Relationship to prior ADRs:** reuses, does not fork, the ADR-0020/0008 token mechanism. ADR-0008's palette was itself green and is superseded by 0020's blue — that history is precedent for "green is a known-good ramp," not a palette to literally restore; the Eat ramp is chosen fresh for contrast against the blue chrome the user switches away from.
