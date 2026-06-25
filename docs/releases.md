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

| Secret name             | Value                                     |
| ----------------------- | ----------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Token created in step 2                   |
| `CLOUDFLARE_ACCOUNT_ID` | Found in the Cloudflare dashboard sidebar |

### 4. Recipe import — Pages Function setup (ADR-0019)

Recipe import (`/import`) calls a Cloudflare Pages Function at
`/api/import-recipe` (source: `functions/api/import-recipe.ts`). Pages picks up
the `functions/` directory automatically — no extra build or `wrangler` config,
and no `compatibility_date` is required. Two manual dashboard steps are needed to
turn the feature on and protect the endpoint. These are deliberately **not**
committed (the token is environment config, not a source secret), so they live
here rather than in the repo.

**a) Bind the shared import token.** The function rejects calls whose
`X-Shoop-Import` header doesn't match the `IMPORT_TOKEN` env var, and the client
sends that header from the build-time `VITE_IMPORT_TOKEN`. Both must hold the same
value. This is **defense-in-depth #2** from ADR-0019 — it ships in the client
bundle, so it is not a true secret; its job is only to drop drive-by scanners that
probe the bare path.

1. In the Cloudflare Pages project (**Workers & Pages → shoop-pwa → Settings →
   Variables and Secrets**), add `IMPORT_TOKEN` for **both** Production and
   Preview environments. Use a long random string (e.g. `openssl rand -hex 24`).
   This is the **runtime** (server-side) value the function reads.
2. Set the same value as a **GitHub Actions secret** named `VITE_IMPORT_TOKEN`
   (**repo → Settings → Secrets and variables → Actions**). Vite inlines this at
   **build time**, and the build runs in GitHub Actions (Direct Upload — see
   step 1), so the value must be injected there; the `build-and-deploy` job passes
   it into `npm run build` via `env:`. **Do not** rely on a `VITE_IMPORT_TOKEN`
   set in the Cloudflare build environment — Cloudflare never builds this app, so
   that value is a no-op and produces an empty client token. (Locally, copy
   `.env.example` to `.env.local` and set `VITE_IMPORT_TOKEN` there — never commit
   it.) The token is baked into the bundle at build time, so a value change only
   takes effect on the **next deploy**.

Both sides return `401` when the token check fails, and the UI distinguishes the
two cases: if the server-side `IMPORT_TOKEN` is unbound it shows "Recipe import
isn't enabled on the server yet (no import token bound)" (`not_configured`); if
the tokens are bound but differ (including an empty client token from a build that
never received `VITE_IMPORT_TOKEN`) it shows "Recipe import token doesn't match the
server (check VITE_IMPORT_TOKEN)" (`unauthorized`).

**b) (Deferred once on custom domain) Add a per-IP rate-limit rule.** This is **defense-in-depth #3** — the
function fetches arbitrary URLs, so cap any single abuser well under the free
plan's daily request quota.

1. In the dashboard, open **Security → WAF → Rate limiting rules** (zone- or
   Pages-scoped) → **Create rule**.
2. Match requests where the URI path equals `/api/import-recipe`.
3. Scope the counter **by client IP**, set a low threshold (≈ 20 requests / min),
   and set the action to **Block** (or **Managed Challenge**).

> The function is stateless, holds no secrets, and never touches IndexedDB, so
> even a full compromise leaks nothing — the abuse ceiling is "import is
> unavailable until the daily quota resets at 00:00 UTC," not a surprise bill
> (the free plan hard-stops at quota with no overage billing). See ADR-0019 for
> the full threat model.

---

## How Deploys Work

The `.github/workflows/deploy.yaml` pipeline runs on every push to `main` with four sequential jobs:

```
validate → e2e-tests → release → build-and-deploy
```

| Job                | What it does                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `validate`         | Runs `npm run validate` (typecheck + lint + Vitest unit tests)                                     |
| `e2e-tests`        | Runs the full Playwright suite against a local dev server; uploads HTML report as a build artifact |
| `release`          | Runs semantic-release: tags the version, bumps `package.json`, generates release notes             |
| `build-and-deploy` | Runs `npm run build`, then deploys `dist/` to Cloudflare Pages via Wrangler                        |

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

## Versioning (ADR-0017)

Versioning is automated by [semantic-release](https://semantic-release.gitbook.io/),
driven by the conventional commits already used in this repo. There is no manual
`package.json` version bump in normal operation — semantic-release reads the
commits merged to `main`, decides the next version, tags it, generates release
notes, and commits the bumped `package.json`/`package-lock.json` back to `main`
with a `[skip ci]` trailer so the release commit does not retrigger the pipeline.

### App semver and DB_VERSION are independent

App semver and `DB_VERSION` version independently — they answer different questions
and obey different rules (see [ADR-0017](adrs/0017-decouple-semver-from-db-version.md)):

- **App semver** is a product-facing signal derived automatically by semantic-release
  from conventional commits. It communicates user-visible change.
- **`DB_VERSION`** is a private monotonic integer owned by `src/db/schema.ts`. Its
  only job is to trigger the right `upgrade()` migration path in IndexedDB. It is
  incremented by hand, in the same PR that adds the new migration case, and it never
  resets.

Both numbers are displayed in the Settings → About panel so users can report them
for support.

### Commit type → version bump

| Commit type               | semver bump | `DB_VERSION` changes?                              |
| ------------------------- | ----------- | -------------------------------------------------- |
| `fix:` / `fix(scope):`    | patch       | no                                                 |
| `feat:` / `feat(scope):`  | minor       | only if a migration is also added in the same PR   |
| `feat(db):`               | minor       | yes (canonical scope for schema migrations)        |
| `BREAKING CHANGE:` footer | major       | no — `DB_VERSION` never resets on a product major  |

**Schema migrations:** any PR that increments `DB_VERSION` in `schema.ts` must
include at least one `feat:` commit (use `feat(db):` as the canonical scope). The
CI `validate` job enforces this as a visibility floor — if `DB_VERSION` changed but
no `feat`-level commit is present, the build fails before deploy.

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
