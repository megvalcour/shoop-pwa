# Task: README Badge Cleanup + CI-Automated Dynamic Badges

## Goal

Replace the eight hardcoded, already-stale badges in the root `README.md` with a
curated set that auto-updates. The "ever-changing" badges (version, coverage,
build status) must derive their values live so they never drift again. Tech-stack
version numbers read live from `package.json`.

The repo is **public** (`megvalcour/shoop-pwa`), so shields.io can read GitHub
Releases, Actions status, and `package.json` directly — no gist is needed for any
badge except coverage (which has no published data source today).

## Decisions (confirmed with user)

- **Badge set:** tech stack (React, TypeScript, Vite, Tailwind) + coverage +
  version + **CI build status**. Drop the PWA / Offline-first / Cloudflare
  identity chips (already covered in prose).
- **Coverage source:** CI runs `vitest --coverage`, extracts the line %, and
  pushes it to a **GitHub Gist** via `schneegans/dynamic-badges-action`;
  shields.io renders the gist via its `endpoint` badge. No README churn.
- **Tech-stack values:** dynamic from `package.json` via shields
  `github/package-json/dependency-version` so they auto-bump on dep upgrades.

## Final badge list

| Badge | Source | Auto-updates when |
| ----- | ------ | ----------------- |
| Version | `img.shields.io/github/v/release/megvalcour/shoop-pwa` | semantic-release cuts a release |
| CI | `img.shields.io/github/actions/workflow/status/.../deploy.yaml?branch=main` | each `main` pipeline run |
| Coverage | `img.shields.io/endpoint?url=<gist raw>` | coverage job pushes the gist |
| React | `github/package-json/dependency-version/.../react` | `react` dep bumps |
| TypeScript | `.../dependency-version/.../dev/typescript` | `typescript` dev dep bumps |
| Vite | `.../dependency-version/.../dev/vite` | `vite` dev dep bumps |
| Tailwind | `.../dependency-version/.../tailwindcss` | `tailwindcss` dep bumps |

## Changes

1. **`README.md`** — replace the 8-badge block with the 7 badges above. Coverage
   badge URL carries a `__COVERAGE_GIST_ID__` placeholder until the gist exists.
2. **`vite.config.ts`** — add `test.coverage` config (`provider: 'v8'`,
   `reporter: ['text', 'json-summary']`, `reportsDirectory: './coverage'`).
   `@vitest/coverage-v8` is already a devDependency; no `package.json` change.
3. **`.github/workflows/deploy.yaml`** — add a `coverage` job (runs on push to
   `main`, parallel to `validate`, does **not** gate deploy): `npm ci` →
   `npx vitest run --coverage` → extract `total.lines.pct` from
   `coverage/coverage-summary.json` → `schneegans/dynamic-badges-action` pushes
   to the gist. Uses `secrets.GIST_SECRET` and `vars.COVERAGE_GIST_ID`.
4. **`docs/releases.md`** — document the one-time manual setup (create gist,
   create PAT with `gist` scope as `GIST_SECRET`, set `COVERAGE_GIST_ID` repo
   variable, paste gist ID into the README coverage URL), mirroring the existing
   Cloudflare-token manual-setup convention.
5. **`PLAN.md`** — note the doc change under Current Status.

## Manual steps the user must do (cannot be automated from here)

- Create a public Gist (any placeholder file) → copy its ID.
- Create a classic PAT with **only** `gist` scope → add as Actions secret
  `GIST_SECRET`.
- Add repo Actions **variable** `COVERAGE_GIST_ID` = the gist ID.
- Replace `__COVERAGE_GIST_ID__` in `README.md` with the gist ID.

Until these are done the coverage badge shows "invalid"; every other badge works
immediately on push.

## Constraints / ADRs

- No ADR governs README/badges. The coverage job is additive and non-gating, so
  it does not alter the ADR-0017/0018 deploy ordering
  (`validate → e2e-tests → release → build-and-deploy`).
- No `package.json` edit (per CLAUDE.md "ask before changing package.json") —
  coverage runs via `npx vitest run --coverage`, not a new script.

## Validation

- `npx vitest run --coverage` produces `coverage/coverage-summary.json` locally.
- README badge URLs resolve (version/CI/tech-stack work without any secret).
- Workflow YAML is valid; coverage job failure cannot block the deploy chain.
