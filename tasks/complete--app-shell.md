---
step: 10
substep: 5
status: final_checks
code_review_level: medium
class: standard
e2e_required: true
clarifications: |
  Visual direction: bold/colorful with warm jewel tones
  Design tokens: semantic/pragmatic names (not color-specific)
  Bottom nav icons: Font Awesome Free (React component approach)
  Route stubs: centered placeholder text
  E2E required: yes
  ADR: not needed for this task
---

# App Shell: Bottom Nav + Route Stubs

## Relevant ADRs

- **ADR-0005** Atomic Design — AppShell lives in `src/components/templates/`
- **ADR-0006** React Router v7 library mode — `createBrowserRouter` + `RouterProvider`, route components in `src/routes/`

## New Packages Required (approval needed before implementing)

| Package | Role | Type |
| --- | --- | --- |
| `react-router` | Client-side routing | dependency |
| `@fortawesome/fontawesome-svg-core` | Font Awesome icon runtime | dependency |
| `@fortawesome/free-solid-svg-icons` | FA solid icon set | dependency |
| `@fortawesome/react-fontawesome` | FA React component | dependency |
| `@testing-library/react` | Component unit testing | devDependency |
| `@testing-library/user-event` | User event simulation | devDependency |
| `@testing-library/jest-dom` | Custom matchers (toHaveClass etc.) | devDependency |
| `@playwright/test` | E2E test runner | devDependency |

## Design Tokens

| Token | Role | Value |
| --- | --- | --- |
| `--color-primary` | Nav bg, primary chrome | `#1B3A2D` |
| `--color-primary-foreground` | Icons/text on primary bg | `#A8C5B8` |
| `--color-accent` | Active state, CTAs | `#D4783A` |
| `--color-destructive` | Delete, alerts | `#8B1C3A` |
| `--color-surface` | Page background | `#F9F3E8` |
| `--color-text` | Body text | `#1C1814` |
| `--color-text-muted` | Secondary text on light bg | `#7A6A5A` |
| `--font-display` | Playfair Display — screen titles | `'Playfair Display', Georgia, serif` |
| `--font-body` | DM Sans — all UI text | `'DM Sans', system-ui, sans-serif` |

---

## Checklist

### Setup
- [x] Get user approval for all new packages listed above
- [x] Install runtime dependencies: `npm install react-router @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons @fortawesome/react-fontawesome`
- [x] Install dev dependencies: `npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test`
- [x] Install Playwright browsers: `npx playwright install --with-deps chromium`

### Design Foundation
- [x] Download Playfair Display (700) and DM Sans (400, 500) WOFF2 files; place in `public/fonts/`
- [x] Update `index.html`: set `<title>Shoop</title>`
- [x] Replace `src/index.css` with `@import 'tailwindcss'` + `@theme` block containing all design tokens above, then `@font-face` declarations for self-hosted Playfair Display and DM Sans
- [x] Add global base styles in `src/index.css`: `body { font-family: var(--font-body); background-color: var(--color-surface); color: var(--color-text); }`
- [x] Update `vite.config.ts` manifest: `name: 'Shoop'`, `short_name: 'Shoop'`, `theme_color: '#1B3A2D'`
- [x] Add a vitest setup file `src/test-setup.ts` that imports `@testing-library/jest-dom`; register it in `vite.config.ts` under `test.setupFiles`

### Routing
- [x] Rewrite `src/App.tsx`: define `router` with `createBrowserRouter`, render `<RouterProvider router={router} />`; route tree has AppShell as the layout route with three children: index → WeeklyRoute, `/default-list` → DefaultListRoute, `/settings` → SettingsRoute

### AppShell Template
- [x] Create `src/components/templates/AppShell.tsx`
  - Root div: `flex flex-col h-dvh` (full mobile viewport height)
  - `<main>`: `flex-1 min-h-0 overflow-y-auto` containing `<Outlet />`
  - `<nav>`: `bg-primary h-16 shrink-0 flex items-center justify-around px-2`
  - Three `<NavLink>` items (Weekly `/` with `end`, Default List `/default-list`, Settings `/settings`)
  - Each tab: `flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors`
  - Active state (via `isActive`): `text-accent bg-accent/10`
  - Inactive state: `text-primary-foreground`
  - Icon: `<FontAwesomeIcon>` at `text-lg`; label: `<span>` at `text-[10px] font-medium`
  - Icons: Weekly → `faCartShopping`, Default List → `faClipboardList`, Settings → `faGear`

### Route Stubs
- [x] Create `src/routes/WeeklyRoute.tsx` — centered placeholder: "Weekly List" heading + "Your shopping list will appear here." body
- [x] Create `src/routes/DefaultListRoute.tsx` — centered placeholder: "Default List" heading + "Your default items will appear here." body
- [x] Create `src/routes/SettingsRoute.tsx` — centered placeholder: "Settings" heading + "App settings will appear here." body
- [x] Each stub: `<div className="flex flex-col items-center justify-center h-full gap-2">` with a `font-display` heading and `text-text-muted` body text

### Unit Tests
- [x] Create `src/components/templates/__tests__/AppShell.test.tsx`
  - Renders all three nav labels (Weekly, Default List, Settings)
  - Active Weekly link on `/` has `text-accent` class (check via `toHaveClass` from jest-dom)
  - Direct navigate to `/default-list` makes Default List active, Weekly inactive
  - Wraps component with `createMemoryRouter` + `RouterProvider` from `react-router` (no MemoryRouter — does not exist in v7 library mode)

### Playwright Config + E2E Tests
- [x] Create `playwright.config.ts` at project root
  - `testDir: './e2e'`
  - `webServer`: `npm run dev`, port 5173, `reuseExistingServer: !process.env.CI`
  - Single project: Chromium, mobile viewport 390×844 (`iPhone 14` preset)
- [x] Create `e2e/navigation.spec.ts`
  - `/` → Weekly tab is active (has `text-accent` in class), others are not
  - Click Default List tab → URL is `/default-list`, Default List tab is active
  - Click Settings tab → URL is `/settings`, Settings tab is active
  - Click Weekly tab from Settings → URL is `/`, Weekly tab is active
  - Direct navigation to `/settings` → correct tab highlighted without clicking

### Final Wiring
- [x] Delete `src/PWABadge.tsx` (no longer referenced from App.tsx after rewrite; was Vite starter boilerplate)
- [x] Delete `src/assets/react.svg` (Vite starter asset, no longer used)
- [x] Run `npm run typecheck` to confirm no type errors

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed. Ready for security review.

**Status**: Security review passed. No issues found. Ready for code review.
