# Reinstate Playwright E2E Gate Before Semantic Release

## Status

Accepted

## The Problem

The CI/CD pipeline has no end-to-end quality gate: the `e2e-tests` job that was originally planned in ADR-0010 was deleted in commit `e954e39`, leaving `validate → release → build-and-deploy` with nothing blocking a semantic-release tag or Cloudflare Pages deploy when the app's UI is broken.

## The Solution

Reinstate a Playwright `e2e-tests` job that runs before `release`, making the chain `validate → e2e-tests → release → build-and-deploy`, and stub HuggingFace model network requests in CI so the suite is deterministic and fast.

## Options Considered

- **Gate `release` (selected):** `e2e-tests` must pass before semantic-release runs; a broken build cannot cut a version tag or land a deploy.
- Gate only `build-and-deploy`: semantic-release would still tag a broken build; version history would contain broken releases.
- No E2E gate: status quo; a broken UI ships to production whenever `validate` passes.

## Rationale

Gating `release` rather than only `build-and-deploy` ensures that a failed E2E run blocks the entire publish path — no version tag, no deploy. This matches the intent of ADR-0010 and is consistent with ADR-0017's requirement that `release` only runs after all quality gates pass.

The dominant historical failure mode was the ~80 MB HuggingFace model download timing out under CI network pressure. All existing specs are already model-agnostic in their assertions: `smart-aisle-location` seeds pre-classified items, and `list-builder-ux` only asserts the page stays interactive while the worker loads. The worker already has a graceful `{ type: 'error' }` fallback path (ADR-0013). By aborting all requests to `huggingface.co`, `hf.co`, and `cdn-lfs` via a shared Playwright fixture (`e2e/support/offlineModel.ts`), the worker falls through its error path deterministically — no download, no flake.

## Notes

- Job structure: `e2e-tests` `needs: [validate]`; `release` `needs: [validate, e2e-tests]`; `build-and-deploy` `needs: [release]` (unchanged).
- Playwright browsers are cached keyed on `package-lock.json` hash to avoid stale browser/CLI version mismatches on Playwright upgrades.
- The HTML report artifact (`playwright-report/`) is uploaded with `if: always()` and retained for 7 days for post-mortem debugging.
- The `github` reporter is added alongside `html` so failures surface inline in the Actions log without downloading the artifact.
- `playwright.config.ts` keeps `webServer: npm run dev` (switching to `vite preview` is a follow-up out of scope here).
- This ADR supersedes ADR-0010, which documented the original (and then-abandoned) three-job pipeline. It also resolves the ADR-0010 portion of the "Reconcile Diverged ADRs" backlog item.
