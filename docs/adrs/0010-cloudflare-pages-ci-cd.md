# Use GitHub Actions + Cloudflare Pages for CI/CD

## Status

Superseded by ADR-0018

## The Problem

The PWA needs automated quality gates and a repeatable deployment path so that every push to `main` is validated and published without manual intervention.

## The Solution

Use GitHub Actions to run quality gates and deploy to Cloudflare Pages on every push to `main`.

## Options Considered

- GitHub Actions + **Cloudflare Pages** (selected)
- GitHub Actions + Netlify
- GitHub Actions + Vercel
- Manual deploy (no CI)

## Rationale

Cloudflare Pages offers zero-config static hosting with a global CDN, a generous free tier, and first-class Wrangler CLI support. The `cloudflare/wrangler-action` GitHub Action integrates cleanly with the existing GitHub repository. Netlify and Vercel are equivalent in capability but add a second account ecosystem without meaningful advantage for a single-user PWA.

The pipeline is structured as three sequential jobs — `validate` → `e2e-tests` → `build-and-deploy` — so that a deploy never lands if quality gates fail.

## Notes

- Cloudflare Pages project must be created manually before the first deploy (see `docs/releases.md`).
- Secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (scoped to the `shoop-pwa` Pages project).
- Playwright E2E artifacts (HTML report) are uploaded on every run, including failures, for post-mortem debugging.
- The HuggingFace WASM model (~80 MB) is fetched at runtime from HuggingFace Hub; if CI network pressure causes E2E flakes, increasing the Playwright navigation timeout in `playwright.config.ts` is the first mitigation.
