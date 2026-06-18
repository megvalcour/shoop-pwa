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

The `.github/workflows/deploy.yaml` pipeline runs on every push to `main` with three sequential jobs:

```
validate → e2e-tests → build-and-deploy
```

| Job               | What it does                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| `validate`        | Runs `npm run validate` (typecheck + lint + Vitest unit tests)               |
| `e2e-tests`       | Runs the full Playwright suite against a local dev server; uploads HTML report as a build artifact |
| `build-and-deploy`| Runs `npm run build`, then deploys `dist/` to Cloudflare Pages via Wrangler |

A deploy only lands if **both** `validate` and `e2e-tests` pass. A failure in either gate leaves the current production deployment untouched.

## Viewing Deployments

- **Cloudflare Pages dashboard:** `dash.cloudflare.com → Workers & Pages → shoop-pwa`
- **GitHub Actions runs:** repository → **Actions** tab
- **Playwright HTML report:** download the `playwright-report` artifact from any Actions run (retained for 7 days)

## Rollback

Cloudflare Pages retains all previous deployments. To roll back:

1. Open the Cloudflare Pages dashboard.
2. Select the `shoop-pwa` project → **Deployments**.
3. Find the target deployment and click **Rollback to this deployment**.
