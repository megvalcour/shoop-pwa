---
step: 11
substep: 0
status: final_checks
class: lightweight
e2e_required: false
clarifications: |
  Default List active task: drop it entirely (removed from PLAN.md + plan file deleted).
  Classification: Lightweight (pure presentation/functionality split, no behavior change).
  E2E required: No — RTL unit coverage is sufficient; update-flow behavior is unchanged.
---

# Task: Make AppVersionPanel a presentational molecule

Atomic Component Refactor #2. Move `usePwaUpdate` orchestration out of the
`AppVersionPanel` molecule and into the consuming Settings route, turning the
molecule into a pure prop-driven component testable without mocking the hook.

## Relevant ADRs

- **ADR-0005 (atomic design):** molecules compose atoms with **no direct store
  access**. `usePwaUpdate` subscribes to the service-worker lifecycle — exactly
  the effect/store access forbidden in a molecule. Fix moves the hook up to the
  route.
- **ADR-0014 (PWA versioning and update strategy):** unchanged. This task only
  relocates *where* the orchestration lives; the `usePwaUpdate` state machine and
  update behavior are untouched. **No new ADR required.**

## Approach

1. `AppVersionPanel.tsx` → pure presentational, props-driven. New strict props
   interface `AppVersionPanelProps`:
   - `version: string`
   - `state: UpdateState` (reuse the `UpdateState` type from the hook via a
     type-only import — keeps the union from drifting, no runtime hook coupling)
   - `updateAvailable: boolean`
   - `onCheck: () => void`
   - `onApply: () => void`
   Keep all existing copy and token classes verbatim.
2. `SettingsRoute.tsx` → call `usePwaUpdate()` + import `APP_VERSION`, compute
   `updateAvailable = needRefresh || updateState === 'update-available'`, pass all
   props down. The route already renders the panel and already has its update
   context mocked in tests, so no extra organism is warranted.
3. `AppVersionPanel.test.tsx` → rewrite to render with plain props; **no
   `vi.mock`**.

## Files to change

| File | Change |
| --- | --- |
| `src/components/molecules/AppVersionPanel.tsx` | Convert to pure props; drop `usePwaUpdate`/`APP_VERSION` imports (keep type-only `UpdateState`). |
| `src/routes/SettingsRoute.tsx` | Call `usePwaUpdate` + `APP_VERSION`; pass props to `AppVersionPanel`. |
| `src/components/molecules/__tests__/AppVersionPanel.test.tsx` | Rewrite without mocking `usePwaUpdate` — render with plain props. |

`SettingsRoute.test.tsx` and `AppShell.test.tsx` already mock `usePwaUpdate`; the
route still calls it, so they continue to pass unchanged (verify).

## Implementation checklist

- [x] Rewrite `AppVersionPanel` as a presentational molecule with the props above.
- [x] Wire `usePwaUpdate()` + `APP_VERSION` in `SettingsRoute` and pass props down.
- [x] Rewrite `AppVersionPanel.test.tsx` to pass props directly — no `vi.mock`.
- [x] `npm run typecheck && npm run lint` clean; run the affected Vitest files.
- [x] `npm run validate` clean (244 tests passed).

## Out of scope

- Any change to `usePwaUpdate` internals or the service-worker update strategy.
- Restyling the panel.

**Review**: Self-reviewed (Lightweight). Isolated change; the only behavioral risk
is the route forgetting to pass a prop — caught by typecheck since the props are
required. Ready to implement.

**Status**: Done. Validation passed (244 tests). No new ADR needed — the change
only relocates orchestration; no new dependency, pattern, or contract introduced.
