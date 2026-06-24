# Releases & Deployment

Shoop deploys automatically to Cloudflare Pages on every push to `main` via GitHub Actions. This document covers the one-time setup and how to operate the pipeline.

## One-Time Setup

### 1. Create the Cloudflare Pages project

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. Navigate to **Workers & Pages → Create → Pages**.
3. Choose **Direct Upload** (not Connect to Git — GitHub Actions drives all deploys).
4. Set **Project name** to `shoop-pwa` and click **Create project**.
5. The project URL will be `https://shoop-pwa.pages.dev`.

> **Note:** The GitHub Actions workflow uses `wrangler pages deploy` (direct upload). Starting with Direct Upload skips the Git integration entirely — no need to disconnect it afterward.

### 2. Create a Cloudflare API token

1. In the Cloudflare dashboard go to **My Profile → API Tokens → Create Token**.
2. Use **Create Custom Token** and add a single permission:
   - **Account > Cloudflare Pages > Edit**
3. Scope it to your account and save. Copy the token value.

> **Note:** The "Edit Cloudflare Workers" template adds more permissions than required. A custom token scoped to `Cloudflare Pages: Edit` is the minimal, correct choice.

### 3. Add GitHub repository secrets

In the GitHub repository go to **Settings → Secrets and variables → Actions** and add:

| Secret name              | Value                                     |
| ------------------------ | ----------------------------------------- |
| `CLOUDFLARE_API_TOKEN`   | Token created in step 2                   |
| `CLOUDFLARE_ACCOUNT_ID`  | Found in the Cloudflare dashboard sidebar |

---

## How Deploys Work

The `.github/workflows/deploy.yaml` pipeline runs on every push to `main` with four sequential jobs:

```
validate → e2e-tests → release → build-and-deploy
```

| Job               | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `validate`        | Runs `npm run validate` (typecheck + lint + Vitest unit tests)               |
| `e2e-tests`       | Runs the full Playwright suite against a local dev server; uploads HTML report as a build artifact |
| `release`         | Runs semantic-release: tags the version, bumps `package.json`, generates release notes |
| `build-and-deploy`| Runs `npm run build`, then deploys `dist/` to Cloudflare Pages via Wrangler |

A deploy only lands if **both** `validate` and `e2e-tests` pass. A failure in either gate blocks the version tag and leaves the current production deployment untouched.

## Viewing Deployments

- **Cloudflare Pages dashboard:** `dash.cloudflare.com → Workers & Pages → shoop-pwa`
- **GitHub Actions runs:** repository → **Actions** tab
- **Playwright HTML report:** download the `playwright-report` artifact from any Actions run (retained for 7 days)

## Rollback

Cloudflare Pages retains all previous deployments. To roll back:

1. Open the Cloudflare Pages dashboard.
2. Select the `shoop-pwa` project → **Deployments**.
3. Find the target deployment and click **Rollback to this deployment**.

---

## Versioning (ADR-0016)

Versioning is automated by [semantic-release](https://semantic-release.gitbook.io/),
driven by the conventional commits already used in this repo. There is no manual
`package.json` version bump in normal operation — semantic-release reads the
commits merged to `main`, decides the next version, tags it, generates release
notes, and commits the bumped `package.json`/`package-lock.json` back to `main`
with a `[skip ci]` trailer so the release commit does not retrigger the pipeline.

### The invariant: `minor(appVersion) === DB_VERSION`

The semver **minor** component is pinned to `DB_VERSION` (the IndexedDB schema
version in `src/db/schema.ts`). This makes the Settings → About panel meaningful:
a user on `v1.5.2` is on **DB schema 5, patch 2 on top of it**. The patch
component increments freely between schema migrations without disturbing the rule.

The invariant is enforced by `scripts/check-version-db-alignment.mjs`, which runs:

- locally via `npm run verify:version` (also folded into `npm run validate`), and
- in CI as the **"Assert semver minor equals DB_VERSION"** step in the `validate`
  job, before `npm run validate` — so drift fails the build before deploy.

### Commit type → version bump

| Commit type             | semver bump | DB_VERSION changes?              |
| ----------------------- | ----------- | ------------------------------- |
| `fix:` / `fix(scope):`  | patch       | no                              |
| `feat:` / `feat(scope):`| minor       | yes, if `schema.ts` is touched  |
| `feat(db):`             | minor       | yes (canonical schema-migration signal) |
| `BREAKING CHANGE:` footer | major     | manual coordination required    |

**Schema migrations:** any PR that increments `DB_VERSION` in `schema.ts` **must**
include at least one `feat:` commit — use `feat(db):` as the canonical scope.
semantic-release bumps the minor from `N` to `N+1`, and the alignment check
confirms `minor(new version) === new DB_VERSION`. If you forget the `feat:` prefix,
semantic-release emits only a patch and the invariant check fails CI, catching it.

**Deliberate major bump:** a true major (large user-facing redesign) is rare and
handled manually — the release manager resets `minor` to `0` and sets `DB_VERSION`
to match via a migration in `schema.ts`/`idbClient.ts`, keeping the invariant.

### Reading a version

`v1.5.2` → **DB schema 5**, second patch release on top of that schema.

### Pipeline ordering

```
validate → e2e-tests → release → build-and-deploy
```

`release` runs semantic-release (needs `contents: write` to push the bump/tag and
`issues`/`pull-requests: write` to comment on released items). `build-and-deploy`
then checks out the **post-release `main` HEAD** so the build's `__APP_VERSION__`
reflects the freshly bumped version rather than lagging one release behind.

### Configuration

semantic-release config lives in `.releaserc.json` at the repo root. It uses
`commit-analyzer`, `release-notes-generator`, `npm` (`npmPublish: false` — this is
a private package), `github`, and `git` (commits `package.json`/`package-lock.json`
back to `main`). The only required secret is `GITHUB_TOKEN`, which Actions provides
automatically. Because the release job pushes back to `main`, `main` must not have
branch protection that blocks the `GITHUB_TOKEN` push (or a PAT must be supplied).
