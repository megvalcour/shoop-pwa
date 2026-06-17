# Use Font Awesome Free (React component) for UI icons

## Status

Accepted

## The Problem

The app needs a consistent set of UI icons for bottom navigation and future interactive controls without adding a build-time SVG pipeline.

## Options Considered

- **`@fortawesome/react-fontawesome` + `@fortawesome/free-solid-svg-icons`** — tree-shakeable React components, no font file, free tier covers all needed glyphs
- Heroicons — React SVG components, MIT, but requires importing individual SVG files per icon
- Lucide React — similar to Heroicons; solid option but no meaningful advantage here
- Inline SVGs in component files — zero dependency but verbose and hard to maintain consistently

## Rationale

Font Awesome Free's React component approach (`<FontAwesomeIcon icon={...} />`) gives a stable, tree-shakeable icon set with no font file to self-host. The free solid tier covers every icon needed for this app's scope. Heroicons and Lucide are comparable quality but offer no advantage that justifies switching from the already-installed package.

## Notes

Only `@fortawesome/free-solid-svg-icons` is installed. Do not add `free-brands-svg-icons` or `pro-*` packages without a separate decision. All icon imports must come from this package — do not mix in inline SVGs or other icon libraries.
