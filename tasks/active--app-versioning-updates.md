# Active Task — App Versioning & Manual Update Check

## Goal

Add a user-facing semantic version (`major.minor.patch`) to the app, display it on
the Settings screen, and add a **"Check for updates"** button that forces the PWA to
pull the latest app files and activate the new service worker — **non-destructively**
(all IndexedDB user data is preserved; only the precached app shell is refreshed and
any pending DB migrations run on the post-update reload).

## Context / Current State

- **PWA stack:** `vite-plugin-pwa` with `strategies: 'injectManifest'`, `srcDir: 'src'`,
  `filename: 'sw.ts'`, `registerType: 'autoUpdate'`, `injectRegister: 'auto'`
  (`vite.config.ts`).
- **Service worker** (`src/sw.ts`) precaches via Workbox and calls `self.skipWaiting()`
  + `clientsClaim()` unconditionally → today the app silently auto-updates with no UI.
- **No SW registration UI** exists; `src/main.tsx` does not touch the SW (registration
  is auto-injected by the plugin).
- **Version:** `package.json` `"version": "0.0.0"`. Nothing surfaces it to the UI.
- **Settings** (`src/routes/SettingsRoute.tsx`) already has stacked `<section>` blocks
  (Your Lists, Your Stores, Default List, Danger Zone). We'll add an **"About"** section.
- **DB migrations** (`src/db/idbClient.ts`) are append-only inside `upgrade()`, keyed on
  `DB_VERSION` (`src/db/schema.ts`, currently `2`). They run automatically on the next
  page load after new code is served — i.e. exactly what a post-update reload triggers.
  **IndexedDB is untouched by SW cache cleanup** (`cleanupOutdatedCaches()` only purges
  the Workbox precache), so updates are inherently non-destructive. This is the key
  guarantee behind "not destructive."

## ADR Check

- No existing ADR covers the **PWA update strategy** (ADRs 0001–0013 cover repo
  architecture, IndexedDB storage, Zustand/TanStack, routing, atomic design, icons,
  aisle matching, CI/CD — none address service-worker update UX).
- This task changes `registerType` from `autoUpdate` → `prompt` and introduces a
  manual update flow, which is an architectural decision worth recording.
  **Action:** add **ADR-0014 — PWA versioning & manual update strategy** documenting
  the move from silent auto-update to user-controlled (prompt) update with a manual
  "Check for updates" affordance, and the rationale (offline-first single-user app
  benefits from explicit, predictable updates over mid-session silent reloads).

## Design Decision — Update Strategy (recommended: `prompt`)

Two viable approaches; the plan implements **B** but the choice is called out for
confirmation:

- **A — keep `autoUpdate`:** button just calls `registration.update()`; if a new SW is
  found it silently activates and reloads. Simplest, but no "an update is available"
  feedback and reloads can interrupt mid-session.
- **B — switch to `prompt` (recommended):** the SW installs but **waits**; the button
  calls `registration.update()` to check, then surfaces "Update available — reload" and
  `updateServiceWorker(true)` activates + reloads on the user's command. Gives the
  button real meaning ("up to date" vs "update available"), no surprise reloads, and
  full user control — a better fit for an offline-first single-user PWA.

> Per the official `vite-plugin-pwa` React docs, `useRegisterSW()` from
> `virtual:pwa-register/react` returns `needRefresh`, `offlineReady`, and
> `updateServiceWorker(reloadPage?)`, and accepts an `onRegisteredSW(swUrl, r)`
> callback — this is the API the update flow is built on.

## Implementation Plan

### 1. Versioning — source of truth + build-time injection

- Set a real starting version in `package.json`: `"version": "1.0.0"`.
  *(Confirm before editing `package.json` per project rules.)*
- In `vite.config.ts`, import the package version and inject build-time constants via
  Vite `define`:
  - `__APP_VERSION__` = `JSON.stringify(pkg.version)`
  - `__BUILD_DATE__` = `JSON.stringify(new Date().toISOString())` (for the About panel /
    diagnostics)
- Add ambient declarations for the globals in a new `src/vite-env.d.ts` addition (or
  `src/global.d.ts`): `declare const __APP_VERSION__: string;` and
  `declare const __BUILD_DATE__: string;`.
- Add `src/lib/appVersion.ts` (small, no-barrel module) exporting
  `export const APP_VERSION = __APP_VERSION__;` and `export const BUILD_DATE = __BUILD_DATE__;`
  so UI imports a typed constant rather than touching globals directly.

### 2. Switch update strategy to prompt-based, self-managed registration

- `vite.config.ts`: change `registerType: 'autoUpdate'` → `registerType: 'prompt'`.
- `src/sw.ts`: replace the unconditional `self.skipWaiting()` with a message-driven
  skip-waiting so the waiting SW only activates when the app asks (prompt model):
  ```ts
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  })
  ```
  Keep `clientsClaim()` and `cleanupOutdatedCaches()`. (`updateServiceWorker(true)` from
  the virtual module posts `SKIP_WAITING` for us.)
- Registration: import `virtual:pwa-register/react` via a hook (below). Set
  `injectRegister: false` in `vite.config.ts` so the plugin doesn't *also* auto-inject a
  second registration (the hook becomes the single registration point).

### 3. Update hook — `src/hooks/usePwaUpdate.ts`

Wrap `useRegisterSW` so UI never imports the virtual module directly:

- Returns `{ needRefresh, offlineReady, checkForUpdate, applyUpdate, updateState }`.
- `onRegisteredSW(swUrl, r)`: store the `ServiceWorkerRegistration`; **also** keep the
  existing periodic check (hourly `r.update()` guarded by `installing` / `navigator.onLine`)
  so the app still notices updates passively.
- `checkForUpdate()`: `await registration.update()`; track a small state machine
  (`idle | checking | update-available | up-to-date | error`) so the button can show
  "Checking…", "Update available", "You're up to date", or an error.
- `applyUpdate()`: `await updateServiceWorker(true)` (activates waiting SW + reloads).
  On reload, the new bundle boots, `openDB(DB_NAME, DB_VERSION, { upgrade })` runs any
  pending migrations, and all IndexedDB data is intact — **non-destructive by construction.**

### 4. UI — Settings "About" section + Update control

- New molecule `src/components/molecules/AppVersionPanel.tsx`:
  - Shows `Shoop v{APP_VERSION}` (optionally build date, subdued).
  - Renders a **"Check for updates"** `Button` (reuse `@/components/atoms/Button`).
  - Drives `usePwaUpdate`: button → `checkForUpdate()`; while checking, disabled +
    "Checking…"; if `needRefresh`/`update-available`, swap to a primary **"Update now"**
    button → `applyUpdate()`; if up-to-date, inline "You're on the latest version."; on
    error, "Couldn't check for updates."
  - No direct store / IndexedDB access (molecule rules); all logic via the hook.
- `src/routes/SettingsRoute.tsx`: add an **"About"** `<section>` (after Default List,
  before Danger Zone) rendering `<AppVersionPanel />`.

### 5. Tests

- `src/hooks/__tests__/usePwaUpdate.test.ts(x)`: mock `virtual:pwa-register/react`
  (alias the module in `vite.config.ts` `test.alias` or `vi.mock`) — assert state
  transitions for check → up-to-date, check → update-available, and `applyUpdate` calling
  `updateServiceWorker(true)`.
- `src/components/molecules/__tests__/AppVersionPanel.test.tsx`: renders version string,
  button states (idle/checking/available), and click wiring (hook mocked).
- `src/routes/__tests__/SettingsRoute.test.tsx`: extend to assert the About section /
  version string render (mock `usePwaUpdate`).
- Add a `vi.mock('virtual:pwa-register/react', …)` helper or test alias so the virtual
  module resolves under Vitest.

### 6. ADR & housekeeping

- Write `docs/adrs/0014-pwa-versioning-and-update-strategy.md` (status Accepted) per the
  decision above; reference it here.
- `PLAN.md`: add this task under Active while in progress; on completion remove it and
  rename this file to `tasks/complete--app-versioning-updates.md`.

## Files Touched

| File | Change |
| --- | --- |
| `package.json` | bump `version` to `1.0.0` *(ask first)* |
| `vite.config.ts` | `define` version/date; `registerType: 'prompt'`; `injectRegister: false`; test alias for virtual module |
| `src/sw.ts` | message-driven `skipWaiting` (drop unconditional skip) |
| `src/global.d.ts` (new) | ambient `__APP_VERSION__` / `__BUILD_DATE__` |
| `src/lib/appVersion.ts` (new) | typed version/date constants |
| `src/hooks/usePwaUpdate.ts` (new) | wraps `useRegisterSW`; check/apply + periodic update |
| `src/components/molecules/AppVersionPanel.tsx` (new) | version display + update button |
| `src/routes/SettingsRoute.tsx` | add About section |
| `docs/adrs/0014-*.md` (new) | record update-strategy decision |
| `*/__tests__/*` | hook, molecule, route tests + virtual-module mock |

## Verification

- `npm run validate` (typecheck + lint + unit).
- `npm run build` then `npm run preview`; in DevTools → Application → Service Workers,
  confirm registration, that a rebuild surfaces an update, that **"Check for updates"**
  reports correctly, and that **"Update now"** reloads to the new build with all
  IndexedDB stores (`shopping_lists`, `list_items`, `default_list`, items) intact.
- `npm run test:e2e` (Settings touches UI/routes; `validate` alone won't catch SW/route
  regressions).

## Confirmed Decisions

1. **Update strategy:** **B — prompt / user-controlled** (silent auto-update is turned
   off; new versions activate + reload only on user command). ✅ confirmed
2. **Version:** bump `package.json` `0.0.0` → **`1.0.0`** as the first user-facing
   version. ✅ confirmed
