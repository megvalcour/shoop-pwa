# Task: Make AppVersionPanel a presentational molecule

## Problem

`AppVersionPanel` is a **molecule** that calls a side-effecting hook directly,
violating the atomic-design contract that molecules have no store/hook access.

`src/components/molecules/AppVersionPanel.tsx:3,6` imports and calls
`usePwaUpdate()`, deriving `needRefresh`, `updateState`, `checkForUpdate`,
`applyUpdate` itself. This is exactly the functionality/presentation conflation
we want to avoid: the component both *owns the update machinery* and *renders the
UI*, so it can only be tested by mocking `usePwaUpdate`.

### Current state

- `src/components/molecules/AppVersionPanel.tsx` — presentational markup +
  `usePwaUpdate()` call (lines 3, 6).
- `src/hooks/usePwaUpdate.ts` — the update hook (`needRefresh`, `updateState:
  'checking' | 'update-available' | 'up-to-date' | 'error' | …`, `checkForUpdate`,
  `applyUpdate`).
- `src/lib/appVersion.ts` — `APP_VERSION`.
- Consumed by the Settings route (confirm exact import site;
  `AppVersionPanel.test.tsx` currently mocks `usePwaUpdate`).

## Relevant ADRs

- **ADR-0005 (atomic design):** "Molecules … compose atoms, **no direct store
  access**." A hook that subscribes to the service-worker lifecycle is precisely
  the store/effect access this rule forbids in a molecule. The fix moves the hook
  to the consuming **route** (the closest thing to an organism for this panel)
  and turns the molecule into a pure prop-driven component.
- **ADR-0014 (PWA versioning and update strategy):** this task does not change
  *what* the update flow does — only *where the orchestration lives*. The state
  machine and `usePwaUpdate` behavior are unchanged.

No ADR is contradicted. **No new ADR required.**

## Approach

### 1. `AppVersionPanel.tsx` → pure presentational

New props (strict interface):

```ts
export interface AppVersionPanelProps {
  version: string;
  state: 'idle' | 'checking' | 'update-available' | 'up-to-date' | 'error';
  updateAvailable: boolean;
  onCheck: () => void;
  onApply: () => void;
}
```

- Render exactly as today, driven entirely by props. No hook imports, no
  `APP_VERSION` import (passed in as `version`), no `void`-wrapped async calls —
  the parent owns those.
- Keep all existing copy and token classes (`text-text-muted`, `text-destructive`,
  the "Update now" vs "Check for updates" branch, the "checking" disabled state).

### 2. Move the hook up to the Settings route (or a thin organism)

- In the route that renders the panel, call `usePwaUpdate()` and `APP_VERSION`,
  compute `updateAvailable = needRefresh || updateState === 'update-available'`,
  and pass everything down:
  ```tsx
  const { needRefresh, updateState, checkForUpdate, applyUpdate } = usePwaUpdate();
  <AppVersionPanel
    version={APP_VERSION}
    state={updateState}
    updateAvailable={needRefresh || updateState === 'update-available'}
    onCheck={() => void checkForUpdate()}
    onApply={() => void applyUpdate()}
  />
  ```
- If the route would get cluttered, introduce a tiny organism
  `AppVersionSection` that does the hook wiring and renders `AppVersionPanel`.
  Prefer the route unless it is already large.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/AppVersionPanel.tsx` | Convert to pure props; drop `usePwaUpdate`/`APP_VERSION` imports. |
| Settings route (or new `organisms/AppVersionSection.tsx`) | Call `usePwaUpdate` + `APP_VERSION`; pass props down. |
| `src/components/molecules/__tests__/AppVersionPanel.test.tsx` | Rewrite without mocking `usePwaUpdate` — render with plain props. |

## Implementation checklist

- [ ] Rewrite `AppVersionPanel` as a presentational molecule with the props above.
- [ ] Move `usePwaUpdate()` to the Settings route (or new thin organism) and wire props.
- [ ] Rewrite `AppVersionPanel.test.tsx` to pass props directly — **no `vi.mock`**.
- [ ] (Optional) add a small test for the wiring organism if created.
- [ ] `npm run validate` clean.
- [ ] Manually confirm the "Check for updates" / "Update now" buttons still work.

## Tests

### Unit (RTL, **no mocks**)

- **`AppVersionPanel.test.tsx`**: renders `Shoop v{version}`; `updateAvailable`
  true → shows "Update now", clicking calls `onApply`; false → shows "Check for
  updates", clicking calls `onCheck`; `state==='checking'` → button disabled and
  reads "Checking…"; `state==='up-to-date'` → shows latest-version copy;
  `state==='error'` → shows the error copy.

## Out of scope

- Any change to `usePwaUpdate` internals or the service-worker update strategy.
- Restyling the panel.
