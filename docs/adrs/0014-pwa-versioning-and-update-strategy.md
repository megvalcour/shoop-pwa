# Use prompt-based, user-controlled PWA updates with a manual "Check for updates" affordance

## Status

Accepted

## The Problem

The service worker silently auto-updated and reloaded the app mid-session, with no
user-facing version and no way to see whether the installed app was current.

## The Solution

Use prompt-based PWA updates (`registerType: 'prompt'`) with a manual "Check for updates" affordance and a user-facing version, so a freshly installed worker activates only when the user taps "Update now".

## Options Considered

- **Prompt-based (`registerType: 'prompt'`) with a manual "Check for updates" button (selected)**
- Keep `autoUpdate` and have the button only call `registration.update()` (silent activate + reload)
- Keep silent `autoUpdate` with no UI (status quo)

## Rationale

Shoop is an offline-first, single-user PWA used while shopping; a surprise reload
mid-list is disruptive. Prompt mode lets the freshly installed worker wait until
the user explicitly taps "Update now", giving the update control real meaning
("up to date" vs "update available") and eliminating unexpected reloads. A
user-facing semantic version (`__APP_VERSION__`, injected at build time from
`package.json`) makes the installed build legible on the Settings → About panel.

Updates are non-destructive by construction: `cleanupOutdatedCaches()` only purges
the Workbox precache, and IndexedDB is untouched, so user data survives and any
pending `DB_VERSION` migrations run on the post-update reload.

## Notes

- `registerType: 'autoUpdate'` → `'prompt'`; `injectRegister: false` so the
  single registration point is `usePwaUpdateController` (`src/hooks/usePwaUpdate.ts`),
  mounted at the app root via `PwaUpdateContext.Provider` in `App.tsx` so the SW
  still registers on load (not only when Settings is opened).
- `src/sw.ts` replaces the unconditional `self.skipWaiting()` with a
  message-driven skip (`SKIP_WAITING`); `updateServiceWorker()` (workbox-window)
  posts it when the user applies an update.
- Version/build-date constants are injected via Vite `define`
  (`__APP_VERSION__`, `__BUILD_DATE__`) and re-exported from `src/lib/appVersion.ts`.
- UI: `AppVersionPanel` molecule in the Settings "About" section.
