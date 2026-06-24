---
status: planned
class: standard
e2e_required: true
---

# Add E2E Tests to the CI/CD Pipeline

## Summary

Reinstate a Playwright E2E quality gate in `.github/workflows/deploy.yaml` so no
release is cut and no Cloudflare Pages deploy lands when end-to-end tests fail.
The E2E job previously existed but was **deleted** (not commented out) in commit
`e954e39` — "ci: removes playwright from ci/cd pipeline." The original removal
left the pipeline at `validate → release → build-and-deploy` with no E2E gate.

This task revives that job, hardens it for CI determinism (the prime historical
failure mode is the runtime HuggingFace model download), and reconciles the
documentation (ADR + backlog) left stale by the original removal.

## Background / Why it failed before

- The deleted job ran `npm run test:e2e` after `npm ci` and
  `npx playwright install --with-deps chromium`, uploading the HTML report on
  failure. That structure is sound and is the starting point for the revival.
- The app's aisle-matcher worker (`src/workers/aisleMatcher.worker.ts`) calls
  `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`, which fetches a
  ~80 MB model from the HuggingFace Hub CDN **at runtime**. Under CI network
  pressure this is slow/flaky and is the most likely cause of the original
  failures.
- The good news: the existing specs are **deliberately model-agnostic in their
  assertions**:
  - `e2e/smart-aisle-location.spec.ts` seeds *pre-classified* list items so
    grouping assertions never wait on live inference.
  - `e2e/list-builder-ux.spec.ts` only asserts the page stays interactive
    *while* the model loads — it never asserts a classification result.
  - The worker already has a graceful `{ type: 'error' }` path when the model
    can't load (no network / no cache).
  This means we can make the model network **deterministic** in CI without
  losing any coverage.

## Relevant ADRs

- **ADR-0010 (Cloudflare Pages CI/CD)** — *Accepted, immutable.* Documents the
  original three-job chain `validate → e2e-tests → build-and-deploy`. The real
  pipeline has since diverged (E2E removed, `release` job added per ADR-0017).
  This task changes the pipeline again, so it needs a **new superseding ADR**
  (see "ADR Changes" below). Cited risks in ADR-0010's Notes (model download
  flake, report-artifact upload) directly inform the hardening here.
- **ADR-0013 (Web-worker aisle inference)** — confirms model loading is isolated
  in the worker and the main thread degrades gracefully; this is what lets us
  stub the model network in CI safely.
- **ADR-0017 (Decouple semver from DB_VERSION)** — the `release` job
  (semantic-release) is part of the current chain; the E2E gate must sit
  **before** `release` so a failing E2E run blocks the tag/version bump and the
  deploy, not just the deploy.

## Design Decisions

### 1. Job placement — gate before `release`, not just before deploy

Insert `e2e-tests` so the dependency chain becomes:

```
validate ─┬─> e2e-tests ─┐
          └──────────────┴─> release ──> build-and-deploy
```

- `e2e-tests` → `needs: [validate]`
- `release` → `needs: [validate, e2e-tests]`  (currently `[validate]`)
- `build-and-deploy` → unchanged `needs: [release]`

Rationale: gating only `build-and-deploy` would still let semantic-release cut a
tag/version on a broken build. Gating `release` blocks the whole publish path.

### 2. Make the model network deterministic in CI (primary hardening)

No current assertion needs live classification, so force the worker down its
graceful `error` path deterministically instead of gambling on an 80 MB download:

- Add a Playwright fixture / `test.beforeEach` (or a global setup project) that
  intercepts requests to the HuggingFace model host and aborts them, e.g.
  `await page.route(/huggingface\.co|hf\.co|cdn-lfs/, route => route.abort())`.
- Prefer a small shared helper in `e2e/` (e.g. `e2e/support/offlineModel.ts`)
  rather than copy-pasting the route into every spec; wire it via a Playwright
  fixture so it applies suite-wide.
- This removes the dominant flake source and makes runs fast and offline-safe,
  consistent with the app's offline-first design (CLAUDE.md "Key Constraints").
- Keep ADR-0010's fallback mitigation documented (raise navigation timeout) in
  case a future spec genuinely needs the model.

### 3. Browser provisioning + caching

- `npx playwright install --with-deps chromium` (OS deps required on the runner).
- Cache `~/.cache/ms-playwright` keyed on the installed Playwright version
  (derive from `package-lock.json` hash, as the original job did) to cut install
  time on warm runs.

### 4. Keep `webServer: npm run dev`

`playwright.config.ts` already starts the dev server with `reuseExistingServer`
gated on `!CI`. Keep it as-is for this task — switching to `vite preview` against
a production build is a nice-to-have (more deploy-realistic, slightly faster) but
is **out of scope** to keep the diff focused; note it as a follow-up.

### 5. Reporting

- Keep `reporter: 'html'`; add `'github'` (and/or `'line'`) so failures surface
  inline in the Actions log without downloading the artifact. Update
  `playwright.config.ts` `reporter` to an array.
- Preserve the `upload-artifact` step with `if: always()` and a retention window
  for post-mortem report access.

## Implementation Checklist

- [ ] **Workflow** — edit `.github/workflows/deploy.yaml`:
  - [ ] Add `e2e-tests` job (`needs: [validate]`): checkout → setup Node 24
        (`cache: npm`) → `npm ci` → cache `~/.cache/ms-playwright` →
        `npx playwright install --with-deps chromium` → `npm run test:e2e` →
        `upload-artifact` `playwright-report/` with `if: always()`,
        `retention-days: 7`.
  - [ ] Change `release` job to `needs: [validate, e2e-tests]`.
  - [ ] Leave `build-and-deploy` `needs: [release]` unchanged.
- [ ] **Test hardening** — add the offline-model route fixture/helper under
      `e2e/` and wire it into the suite (per Design Decision #2). Verify
      `your-stores`, `aisle-sorting`, `reset-data`, `navigation`,
      `shopping-lists`, `list-builder-ux`, `smart-aisle-location` all still pass.
- [ ] **Config** — update `playwright.config.ts` `reporter` to
      `[['html'], ['github']]` (and optionally bump navigation timeout for the
      model-download fallback path).
- [ ] **ADR** — author `docs/adrs/0018-reinstate-e2e-gate-in-pipeline.md` (see
      below) and set ADR-0010 `Status: Superseded by ADR-0018`.
- [ ] **Backlog/PLAN** — apply the PLAN.md edits described below.
- [ ] **Docs** — if `docs/releases.md` describes the job sequence, update it to
      reflect the four-job chain.
- [ ] Run `npm run validate` (typecheck + lint + unit) and `npm run test:e2e`
      locally before pushing. A change is not done while CI is red.

## ADR Changes

ADRs are immutable once accepted, so the divergence is resolved with a **new**
ADR plus the single permitted `Status` edit on the old one:

- **New `docs/adrs/0018-reinstate-e2e-gate-in-pipeline.md` (Accepted).** Document
  the real, current four-job pipeline
  `validate → e2e-tests → release → build-and-deploy`, the decision to gate
  `release` (not just deploy) on E2E, and the CI determinism strategy (stub the
  HuggingFace model network; rely on the worker's graceful-degradation path per
  ADR-0013). Reference ADR-0017 for why `release` sits in the chain.
- **Edit ADR-0010** → `Status: Superseded by ADR-0018` (body untouched).

This new ADR fully captures the *correct* pipeline, which means it **resolves
the ADR-0010 half** of the existing "Reconcile Diverged ADRs (0008 & 0010)"
backlog item — that item no longer needs its own superseding ADR for 0010.

## Backlog Changes (PLAN.md) once implemented

1. **"E2E Audit" item** — its first bullet ("Implement E2E testing in pipeline
   (currently commented out due to failures)") is **completed** by this task.
   Remove that bullet and narrow the item to the remaining work: *"Audit existing
   E2E tests and harden/expand coverage"* (a test-quality effort, separate from
   pipeline wiring). Also fix the inaccurate "commented out" wording — it was
   removed, now reinstated.
2. **"Reconcile Diverged ADRs (0008 & 0010)" item** — the **0010 portion is
   handled here** (superseded by ADR-0018). Narrow this backlog item to ADR-0008
   only (design-tokens / visual-identity drift), retitling it to
   *"Reconcile Diverged ADR (0008)"*.
3. **Task lifecycle** — on completion, per CLAUDE.md: rename this file to
   `tasks/complete--e2e-in-cicd-pipeline.md`, update PLAN.md "Current Status",
   and clear the Active Task slot.

## Known Risks

- **Model download still attempted on `load`.** The route-abort fixture prevents
  the network hit, but confirm the abort doesn't throw uncaught — the worker's
  `catch` should post `{ type: 'error' }` and the UI should stay interactive
  (already covered by `list-builder-ux.spec.ts`).
- **Browser cache key drift.** If the cache key isn't tied to the Playwright
  version, a Playwright bump can serve a stale browser build (we hit exactly this
  class of mismatch — installed CLI vs. available browser build — during
  planning). Key the cache on the resolved Playwright version.
- **CI runtime.** Full suite (31 tests, retries: 2) on the dev server adds a few
  minutes before `release`. Acceptable as a gate; the `vite preview` follow-up
  can reclaim time later.

## Manual Verification

After merge to `main`, confirm in GitHub Actions that all four jobs run in order
and that `release`/`build-and-deploy` are skipped if `e2e-tests` fails. Confirm
the `playwright-report` artifact uploads on both pass and fail.

## Out of Scope

- PR-triggered runs / preview deploys (pipeline is push-to-`main` only).
- Switching `webServer` to `vite preview` against a production build (follow-up).
- The broader E2E coverage-hardening audit (remains its own backlog item).
- ADR-0008 design-token reconciliation (remains its own backlog item).
