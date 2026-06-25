# Use a first-party stateless Cloudflare Pages Function as a CORS fetch proxy for recipe import

## Status

Accepted

## The Problem

Browsers block cross-origin fetches to arbitrary recipe URLs, and the project has no backend by design; a server-side execution surface is needed solely to retrieve and parse recipe pages during import.

## The Solution

A single stateless Cloudflare Pages Function (`/api/import-recipe`) that fetches a recipe URL server-side, extracts schema.org `Recipe` JSON-LD, and returns normalized ingredient data — with no storage, no user data, and no secrets.

## Options Considered

- **Manual-paste only** — users copy-paste ingredient lists; no server needed. Kept as a fallback for sites that block bots or where JSON-LD is absent, but not viable as the primary path.
- Third-party CORS proxy (e.g. `allorigins.win`, `corsproxy.io`) — rejected: privacy concern (recipe URLs include the user's intent; the third party logs them), reliability concern (free proxies disappear), and no control over abuse surface.
- **First-party Cloudflare Pages Function** — selected. Zero marginal cost on the free plan, co-located with the existing deploy target (ADR-0010), stateless, and fully under our control.

## Rationale

The function is a stateless, read-only proxy: it fetches a URL the user explicitly provided, parses it, and discards it. It stores nothing, receives no credentials, and touches no IndexedDB data — so it does not weaken the IndexedDB-only data model (ADR-0002) or the offline-first guarantee (ADR-0001). The offline shopping/check-off critical path is unaffected; recipe import degrades gracefully when offline (clear error state + manual paste fallback).

**Security posture — cheap defense-in-depth:** Cloudflare's free plan hard-stops at its daily request quota with no overage billing. The worst-case abuse outcome is "import unavailable until 00:00 UTC reset," not a surprise bill. Given that ceiling, three lightweight controls suffice:

1. **SSRF / open-proxy guards in the function:** scheme allowlist (`http`/`https` only), private-IP / loopback / link-local block, redirect cap, response-size cap (~2 MB), and hard timeout (~8 s via `AbortController`).
2. **Shared import token (`X-Shoop-Import` header):** the function requires a token matching the `IMPORT_TOKEN` env var bound to the Pages project (set in the Cloudflare dashboard, never committed). The client sends it from the `VITE_IMPORT_TOKEN` build-time env var. This is not a true secret (it ships in the client bundle), but it drops drive-by scanners that probe the path — the bar to abuse is raised for essentially zero implementation effort.
3. **Per-IP rate-limit rule (Cloudflare dashboard, free tier):** configured on `/api/import-recipe` to cap any single IP well under the daily quota. No code; one-time dashboard setup documented in `docs/releases.md`.

Even a full function compromise leaks nothing, because the function holds no secrets and no user data. Blast radius = "free proxy for the attacker + daily quota consumed."

## Notes

- **Parser isolation:** JSON-LD extraction lives in a separate pure module (`functions/_lib/parseRecipeJsonLd.ts`) with no network dependencies, making it unit-testable without mocking `fetch`.
- **CLAUDE.md "no remote server" framing:** this function is explicitly bounded — stateless, no persistence, read-only — and is recorded here precisely because it is the first server-side execution surface in the project. Future functions must each justify themselves against this record; CLAUDE.md's framing is not implicitly widened.
- **Android share intent quirk:** many Android share intents place the URL in the `text` parameter rather than `url`. The `/import` route must check `url` first, then scan `text` for the first `https?://` token.
- **iOS:** Web Share Target is not supported on iOS Safari. A manual "Import from recipe" entry point (navigates to `/import` with an empty state) provides equivalent functionality on iOS and desktop.
