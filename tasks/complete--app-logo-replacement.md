# Active Task: Replace App Logo with Shopping-Related Mark

## Goal

Replace the current default/placeholder app logo (`public/favicon.svg`, an Inkscape-edited
generic SVG) with a shopping-themed logo derived from the already-installed **FontAwesome
Free** icon set, and regenerate all downstream PWA icons from it.

## Background / Findings

- **Single source of truth:** `public/favicon.svg` is the only logo source. The
  `@vite-pwa/assets-generator` (`pwaAssets: { config: true }` in `vite.config.ts`, driven by
  `pwa-assets.config.ts` → `images: ['public/favicon.svg']`) generates **every** PWA icon from
  it: `favicon.ico`, `apple-touch-icon`, `pwa-192x192.png`, `pwa-512x512.png`, and the maskable
  variant. Replacing this one file cascades to all of them.
- **No separate in-app brand logo** exists. The bottom nav "Shop" tab already uses FA
  `faCartShopping` (`src/components/templates/AppShell.tsx`); store rows use `StoreLogo`
  (remote `.png`s). So "the main app logo" == the favicon / PWA install icon.
- **Icon availability — RESOLVED, no alternatives needed.** `@fortawesome/free-solid-svg-icons`
  v7 is already a dependency, and `faCartShopping` is already imported and rendering in
  `AppShell.tsx`. All requested candidates ship in the **Free Solid** set:
  - `faCartShopping` (shopping cart) — already used in-app
  - `faBasketShopping` (shopping basket)
  - `faCarrot`
  - `faAppleWhole`
  - (also available: `faBagShopping`, `faLemon`, `faStore`)
  FontAwesome Free icons are CC BY 4.0 — usable, attribution appreciated (note in README, no
  code/runtime change required).

## Recommended Icon

**`faCartShopping`** — for brand consistency with the existing "Shop" nav tab, the app icon and
the primary navigation icon become the same mark. (Basket / carrot / apple remain easy
drop-in swaps — only the embedded glyph path changes.)

## Plan

1. **Compose the new `public/favicon.svg`.**
   - Build a clean, hand-authored SVG (drop the Inkscape cruft) with `viewBox="0 0 512 512"`.
   - Brand-colored rounded-square background using the manifest `theme_color` `#084887`, with a
     corner radius (~96) so it reads well as a maskable icon.
   - Embed the white FontAwesome glyph path centered at ~60% scale to respect the maskable
     "safe zone" (so Android doesn't crop it). FA Solid icons use a `0 0 576 512` (cart) or
     `0 0 512 512` viewBox; translate + scale the path to center within the 512 canvas.
   - Glyph fill `#ffffff` (or the `--accent` color) for contrast on the navy background.
   - Path data sourced from the FA Free icon definition (`faCartShopping.icon[4]`).

2. **Regenerate PWA assets** from the new source:
   - `npx pwa-assets-generator` (uses `pwa-assets.config.ts`), and/or confirm `npm run build`
     regenerates them via the `pwaAssets` plugin.
   - Confirm generated `favicon.ico`, `apple-touch-icon-180x180.png`, `pwa-192x192.png`,
     `pwa-512x512.png`, and `maskable-icon-512x512.png` reflect the new mark.

3. **Verify head links / manifest.**
   - `index.html` currently has **no** favicon `<link>` tags — `vite-plugin-pwa` injects them at
     build from the generated assets. Confirm injection works; only add explicit `<link>`/
     manifest `icons` entries if the build does not inject them.

4. **Validate.**
   - `npm run build` (must succeed and emit the icons).
   - `npm run validate` (typecheck + lint + unit tests) — no source TS changes expected, but
     run to be safe.
   - Spot-check `npm run dev` / preview that the browser tab favicon and install icon render the
     new logo.
   - Note: no existing test asserts on `favicon.svg` contents; `StoreLogo.test.tsx` is unrelated
     (store logos, not the app logo).

5. **Housekeeping.**
   - Add a short FontAwesome CC BY 4.0 attribution line to `README.md` (if present).
   - On completion: update `PLAN.md`, rename this file to `tasks/complete--app-logo-replacement.md`.
   - Commit to `claude/app-logo-replacement-vrwf2p` and push.

## Out of Scope

- No new in-app logo component, splash screen redesign, or color/theme changes.
- No `package.json` dependency changes (FA Free is already installed).

## Open Choice (default if not specified)

Icon defaults to **`faCartShopping`**. Swapping to basket/carrot/apple is a one-line path change.
