---
step: 10
substep: 5
status: final_checks
class: lightweight
e2e_required: false
clarifications: |
  Cloudflare Pages project not yet created; user has an existing CF account.
  Trigger on push to main only.
  Combines both CI/CD backlog items: quality gates + deploy in one workflow.
  Secret naming and action versions mirror capsule-mono/.github/workflows/deploy.yaml.
  README update is instead a new doc/releases.md document.
---

# CI/CD Pipeline — Cloudflare Pages via GitHub Actions

## Relevant ADRs

- ADR-0001: Single-Repo Vite Architecture — confirms `dist/` is the build output, no monorepo tooling (no Turbo), use plain `npm` scripts.

## Scope

Set up a GitHub Actions CI/CD pipeline that runs quality gates (typecheck, lint, unit tests, E2E tests) on every push to `main`, then builds and deploys the PWA to Cloudflare Pages. Also covers the companion ADR and a `docs/releases.md` operational doc.

**Out of scope:** Preview deployments for PRs, branch protection rules, Cloudflare Pages project creation (manual step documented in releases.md), Playwright visual regression.

## Implementation Checklist

- [x] Create `.github/workflows/deploy.yaml`
  - [x] `validate` job: checkout → setup Node 24 with `cache: 'npm'` → `npm ci` → `npm run validate`
  - [x] `e2e-tests` job (needs: validate): checkout → setup Node 24 with `cache: 'npm'` → `npm ci` → `npx playwright install --with-deps chromium` (requires OS deps) → cache Playwright browser dir keyed on Playwright version → `npm run test:e2e` → upload `playwright-report/` artifact with `if: always()` so it uploads even on test failure
  - [x] `build-and-deploy` job (needs: [validate, e2e-tests]): checkout → setup Node 24 with `cache: 'npm'` → `npm ci` → `npm run build` → `cloudflare/wrangler-action@v3` deploy `dist` to `shoop-pwa` project
  - [x] Wire `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets
  - [x] Set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` top-level env
- [x] Write `docs/adrs/0010-cloudflare-pages-ci-cd.md`
- [x] Write `docs/releases.md` (setup steps, secrets, how deploys work)
- [x] Update `PLAN.md`: remove both combined CI/CD backlog items, mark active

## Known Risks

- **HuggingFace WASM model download in E2E**: The app fetches `Xenova/all-MiniLM-L6-v2` (~80 MB) from HuggingFace Hub on first load. Under CI network pressure this could flake. Mitigation: ensure Playwright's `timeout` in `playwright.config.ts` is at least 30s for navigation.

## Manual Verification

After merging, confirm in GitHub Actions that all three jobs pass and the Cloudflare Pages dashboard shows a new deployment.

**Review**: Approved by fresh session. Ready to implement.

**Status**: Implementation done. Ready for validation.

**Status**: Validation passed (typecheck + lint clean; no logic changes — manual verification via GitHub Actions post-merge). Lightweight task — skipping security and code review gates. Ready for final checks.
