---
step: 4
substep: 4
status: planning
class: lightweight
e2e_required: false
clarifications: |
  1. Apple Developer account: enrollment is part of this phase's setup decisions (not yet enrolled)
  2. Minimum iOS target: iOS 18+; ADR proposes this
  3. Distribution: TestFlight — single other user, one-tap recipe import experience, no App Store review needed
  4. Spike execution: hands-on — user has Mac with Xcode and iOS device/simulator available
  5. Android: iOS-only first; open to revisiting if build approach changes later
---

# Phase 0: iOS Capacitor — Decision Record & Feasibility Spikes

## Relevant ADRs

- **ADR-0001**: Single-repo Vite architecture — Capacitor must uphold, not fork, this constraint
- **ADR-0002**: IndexedDB for core storage — Spike B validates persistence in Capacitor container
- **ADR-0003 / ADR-0011 / ADR-0013**: HuggingFace WASM, layered matching, web-worker inference — Spike A validates WASM in WKWebView; SharedArrayBuffer threading unavailable under custom scheme, lexical fallback expected to absorb this
- **ADR-0010 / ADR-0018**: Cloudflare CI/CD, E2E gate — informs build pipeline integration decisions in ADR-0025
- **ADR-0014 / ADR-0016**: PWA versioning, holistic versioning — `build → cap sync` must fit the existing version flow
- **ADR-0019**: Recipe-import fetch proxy — online-only; out of offline scope

## Goal

Ratify the Capacitor approach via ADR-0025 and de-risk the two known unknowns (WASM in WKWebView, IndexedDB persistence) via hands-on spikes before Phase 1 implementation commits to the full pipeline.

## Exit Criteria

- ADR-0025 drafted, spike findings recorded, status set to Accepted
- Spike A: WASM/HuggingFace confirmed running in WKWebView (or mitigation documented)
- Spike B: IndexedDB + Cache Storage confirmed persisting across app launches in Capacitor container
- Open decisions recorded in ADR: bundle ID, iOS target, distribution approach, Developer account

---

## Implementation Steps

### Part 1 — Research

- [ ] Skim ADR-0001, ADR-0002, ADR-0011, ADR-0013, ADR-0016 for constraints that shape the ADR rationale
- [ ] Review Capacitor WKWebView behavior for cross-origin isolation / SharedArrayBuffer (document expected: unavailable under `capacitor://` scheme — no COOP/COEP headers possible)
- [ ] Review Capacitor IndexedDB/storage persistence docs (confirm data lives in app container, not in Safari's evictable storage)

### Part 2 — Draft ADR-0025

- [ ] Create `docs/adrs/0025-capacitor-ios-native-wrapper.md` from `_template.md`
- [ ] Write **The Problem**: iOS cannot register a standalone PWA in the share sheet; `share_target` is inert on iOS, and Safari shortcut storage is isolated from the PWA's IndexedDB
- [ ] Write **The Solution**: wrap Shoop in a thin Capacitor shell bundling the same `dist/` — `build → cap sync` is the single update path
- [ ] Write **Options Considered**: Capacitor (selected), PWABuilder iOS (rejects — wraps a live URL, fights offline-first design), React Native (rejects — full rewrite, violates ADR-0001)
- [ ] Write **Rationale**: bundled assets → true offline-from-install; native Share Extension → the only iOS path to the share sheet; single web layer → zero fork of React/Tailwind/TanStack surface
- [ ] Write **Notes** section with the following decisions:
  - Distribution: TestFlight (not App Store) — one other user, one-tap recipe import; no App Store review overhead
  - iOS minimum target: iOS 18+
  - Apple Developer Program enrollment required (USD 99/year); prerequisite for TestFlight
  - Bundle ID proposed: `io.shoop.app` (confirm before first Xcode build)
  - Android: out of scope; web `share_target` remains for Android PWA; revisable if build approach changes
  - Shared-pipeline principle: a change to the PWA reaches the iOS app via `npm run build && npx cap sync` with no manual re-implementation
  - Spike-findings sub-section: leave as TBD until Parts 4 & 5 are complete
- [ ] Set ADR status to `Proposed`

### Part 3 — Install Capacitor (spike scaffolding)

> ⚠️ **Pause here — requires `package.json` modification. Confirm with user before running install.**

- [ ] Install Capacitor core, CLI, and iOS packages:
  ```bash
  npm install @capacitor/core @capacitor/cli @capacitor/ios
  ```
- [ ] Initialize Capacitor configuration (sets `webDir: 'dist'` to match Vite output):
  ```bash
  npx cap init "Shoop" "io.shoop.app" --web-dir dist
  ```
- [ ] Verify `capacitor.config.ts` is created with correct `appId`, `appName`, and `webDir`
- [ ] Add iOS Derived Data and Pods to `.gitignore`:
  ```
  # Capacitor / iOS
  ios/App/Pods/
  ios/App/build/
  ios/App/.build/
  *.xcworkspace/xcuserdata/
  ```
- [ ] Build the web app: `npm run build`
- [ ] Add the iOS native project: `npx cap add ios`
- [ ] Sync web assets to the iOS project: `npx cap sync`

### Part 4 — Spike A: WASM in WKWebView

- [ ] Open the iOS project in Xcode: `npx cap open ios`
- [ ] Select an iOS 18+ simulator (or connected real device) and build + run
- [ ] Navigate to the AddItemForm; type a grocery item name to trigger auto-categorization
- [ ] Observe: does the model load? Does classification return results? Record latency
- [ ] Check Xcode console for WASM/threading errors (expect: SharedArrayBuffer unavailable; verify lexical fallback from ADR-0011 activates gracefully)
- [ ] Record pass/fail and any latency notes; update ADR-0025 spike-findings sub-section

### Part 5 — Spike B: IndexedDB & Cache Storage Persistence

- [ ] Using the same simulator/device build, add several items to the grocery list and create a store
- [ ] Force-quit the app from the iOS app switcher
- [ ] Relaunch the app; verify all data persists (IndexedDB survived container close)
- [ ] Optional: open Xcode's Web Inspector (Safari → Develop → Simulator) and inspect storage quota/usage
- [ ] Record pass/fail; update ADR-0025 spike-findings sub-section

### Part 6 — Finalize ADR & Validate

- [ ] Fill all TBD placeholders in ADR-0025 with spike findings
- [ ] Change ADR status from `Proposed` to `Accepted`
- [ ] Run `npm run validate` — no production code changed, should be clean
- [ ] Confirm exit criteria are all met

---

## Smoke Test

This phase has no automated Playwright tests. The gate is manual:
- ADR-0025 accepted and committed
- Spike A documented (WASM result + latency, or mitigation)
- Spike B documented (IndexedDB persistence confirmed)
