---
status: backlog
class: epic
e2e_required: true
clarifications: |
  High-level, multi-phase outline only. Each phase is intentionally general and
  MUST be promoted to `tasks/active--*.md` and planned in full detail (with its
  own ADR review) before any implementation. Do not implement directly from this
  file.
  Driving goal: ship Shoop to iOS via a thin native wrapper while keeping ONE
  shared web codebase, so every PWA change flows into the iOS app with no fork.
  Headline motivator: close the iOS `share_target` gap (recipe "share into app"),
  which the web platform cannot provide for a standalone PWA on iOS.
---

# iOS App via Capacitor — Shared-Pipeline Native Wrapper

## Goal

Distribute Shoop as an installable iOS app **without forking the codebase**. The
existing Vite + React PWA stays the single source of truth; the iOS app is a thin
Capacitor shell that bundles the same built web assets. The primary capability
this unlocks that the web cannot provide on iOS is a **native Share Extension**,
giving iOS users the "share a recipe into Shoop" flow that `share_target`
delivers on Android today.

## Why Capacitor (decision context, to be ratified in an ADR)

- **Bundled assets, not a hosted URL.** Capacitor ships `dist/` inside the app and
  serves from `capacitor://localhost` — true offline-from-install, no public host
  required. (PWABuilder's iOS path wraps a live URL and fights Shoop's
  offline-first, server-less design.)
- **Native Share Extension** is the only way to register Shoop in the iOS share
  sheet; the web `share_target` manifest is inert on iOS for a standalone PWA, and
  storage isolation means a Safari-based shortcut can't reach the app's IndexedDB.
- **One web layer.** The React/Tailwind/TanStack/Zustand surface ships untouched;
  platform differences hide behind a thin adapter (Phase 1).

## Shared-Pipeline Principle (the constraint that shapes every phase)

A change to the PWA must reach the iOS app with **no manual re-implementation**:

1. One repo, one `dist/`, one set of components (upholds ADR-0001).
2. Platform-specific behavior lives behind a single capability adapter with a web
   impl and a native impl — feature code calls the adapter, never the platform.
3. Build/release is automated: `build → cap sync → iOS package` runs in CI off the
   same version source as the PWA (ADR-0016 holistic versioning).

Each phase below is a **general step**. It will be refined into a detailed,
ADR-reviewed `active--` plan before implementation.

---

## Phase 0 — Decision record & feasibility spikes

Ratify the approach and de-risk the two known unknowns before committing.

- Write a **new ADR**: "Capacitor wrapper for native iOS distribution" — records
  the native shell decision, bundled-asset model, and the shared-pipeline
  principle. Note it brushes the "no remote server / single-repo" framing
  (ADR-0001) and explain why it upholds rather than violates it.
- **Spike A — model in WKWebView:** confirm the `@huggingface/transformers` WASM
  path runs in WKWebView (expect single-threaded; no cross-origin isolation under
  the custom scheme) and that classify/embed latency is acceptable on a real
  device. Lean on the fact that the model is already a *fallback* behind the
  deterministic lexical path (ADR-0011/0013), so degradation is graceful.
- **Spike B — storage durability:** confirm IndexedDB + Cache Storage persist in
  the app container across launches (Capacitor removes Safari's eviction risk).
- Decide: minimum iOS target, Apple Developer account ownership, signing identity.

**Exit:** ADR accepted; both spikes green or with documented mitigations.

## Phase 1 — Shared build pipeline & platform adapter (core value)

Wire Capacitor into the existing single repo so the web app remains canonical.

- Add Capacitor to the repo; generate and check in the iOS native project (thin
  shell). Establish `build → cap sync` as the only path that updates the app.
- Introduce a **capability adapter layer**: a small interface (e.g. share intake,
  later anything else platform-specific) with a web implementation and a native
  implementation selected at runtime/build. Feature code depends only on the
  interface. The web build behavior is unchanged.
- Confirm path aliases, no-barrel, atomic-design conventions all hold for any new
  adapter modules (AGENTS.md).

**Exit:** `npm run build && npx cap sync` produces a runnable iOS app of the
current PWA, with zero changes to existing feature components.

## Phase 2 — Offline asset & model bundling

Make the native app fully functional from first launch, no network needed.

- Bundle web assets into the app (no hosted-URL dependency).
- **Bundle the embedding model** into native/web assets and point transformers.js
  at the local copy (offline from install); evaluate switching `dtype` from `fp32`
  to a quantized variant for size/speed on mobile.
- Verify the seed/migration path on a **fresh native install** (DB_VERSION
  migrations in `idbClient.ts` run as expected in the new origin).
- Decide the service-worker story under Capacitor (bundled assets reduce SW
  importance; reconcile with ADR-0014 PWA update strategy).
- Note: recipe import remains online-only by design (depends on the ADR-0019 fetch
  proxy) — that's acceptable and out of the offline critical path.

**Exit:** app installs and runs end-to-end with airplane mode on (except recipe
import); auto-categorization works offline.

## Phase 3 — Native share ingestion (`share_target` parity) — headline feature

Give iOS the "share a recipe into Shoop" flow, funneled into the existing import.

- Add an iOS **Share Extension** (evaluate `@capacitor-community/send-intent` or a
  hand-rolled extension) exposed through the Phase 1 capability adapter.
- **Single funnel:** native shares resolve to the same entry point the web
  `share_target` uses today — the `/import` route's `deriveSharedUrl` /
  `RecipeImporter initialUrl` path. No duplicate import logic.
- Handle both **cold start** and **warm resume** delivery of the shared URL.
- Decide Android's future: keep web `share_target`, or migrate Android to the same
  native intake if/when Android packaging is added.
- Write an **ADR for the dual-delivery share architecture** (web manifest +
  native extension converging on one import flow); relate to ADR-0019.
- Keep the manual-paste fallback as the durable baseline.

**Exit:** sharing a recipe URL from Safari/another app lands in Shoop's import
screen with the URL prefilled, on a real device.

## Phase 4 — Native UX & platform polish

Make it feel like an app, not a wrapped page.

- Safe-area/notch insets, status bar, splash screen, app icon set, theme color,
  keyboard avoidance, overscroll behavior.
- Reconcile gesture conflicts (dnd-kit drag / swipe actions vs. iOS edge-swipe
  back).
- App Store metadata and privacy disclosures (data stays on device except the
  recipe-import fetch proxy).

**Exit:** UX review passes on device; no gesture or layout regressions vs. PWA.

## Phase 5 — Distribution, signing & unified release pipeline

Automate shipping both targets from one version.

- Apple Developer enrollment, certificates/profiles, TestFlight.
- CI signing + automated iOS build (e.g. fastlane or Xcode Cloud) wired into the
  existing release flow so a tagged release ships the PWA (Cloudflare Pages,
  ADR-0010/0018) **and** the iOS app from the **same version** (ADR-0016).
- App Store review prep — ensure the app demonstrates native value (share
  extension + bundled offline) to satisfy guideline 4.2 (not a thin wrapper).

**Exit:** a single release tag produces both a deployed PWA and a TestFlight
build, with matching versions.

## Phase 6 — Testing & parity gates

Cover what web E2E cannot.

- Keep Vitest + Playwright as the web gate (unchanged).
- Add a native smoke/E2E layer for the paths Playwright can't reach: share-
  extension intake, deep-link/resume, offline model, storage persistence.
- Define the **release parity gate**: the on-device checklist that must pass
  before any iOS release.

**Exit:** documented, repeatable native verification run; parity gate enforced.

---

## ADRs to consult / author

- **Consult (upheld):** ADR-0001 (single-repo), ADR-0002 (IndexedDB),
  ADR-0011/0013 (layered matching / web-worker inference), ADR-0014/0016
  (versioning), ADR-0010/0018 (Cloudflare CI/CD), ADR-0019 (recipe-import fetch
  proxy).
- **Author (new):**
  1. Capacitor wrapper for native iOS distribution (Phase 0).
  2. Dual-delivery share architecture: web `share_target` + native extension
     converging on one import flow (Phase 3).

## Open decisions to resolve during refinement

- App Store distribution truly required, or is personal install enough? (If not,
  Phases 4–6 shrink dramatically and "Add to Home Screen" may suffice.)
- Minimum supported iOS version.
- Share-extension plugin vs. hand-rolled native extension.
- Keep/drop the service worker under Capacitor.
- Android packaging in scope now, or iOS-only first?

## Out of scope (for this epic)

- Any backend/sync beyond the existing stateless recipe-import proxy.
- React Native / native Swift rewrite (explicitly rejected in favor of the shared
  web codebase).
