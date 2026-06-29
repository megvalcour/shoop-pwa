# Fix Playwright/Chromium Browser Mismatch in Web Sessions

## Problem

In the Claude Code web execution environment, `npm run test:e2e` (`playwright test`)
fails before any test runs:

```
Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-<N>/chrome-linux/headless_shell
```

The pinned `@playwright/test` (locked at `1.61.0`) resolves to a Chromium /
headless-shell **build number** that is newer than the one pre-baked into the web
container. Confirmed in this environment:

- Env exports `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
- Pre-installed builds: `chromium-1194`, `chromium_headless_shell-1194` (plus
  `ffmpeg-1011`).
- Playwright `1.61.0` wants a newer build (observed: `1228`), so its registry
  lookup misses.
- `npx playwright install` is **disabled** in this environment
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` semantics + no network for browser CDN), so
  we cannot fetch the matching build.

The current manual workaround is a throwaway, uncommitted local config that
overrides `launchOptions.executablePath` to the installed binary each session.
Goal: make `npm run test:e2e` work **out-of-the-box** in web sessions, with **zero
regression to CI** (which installs its own browsers via `npx playwright install
--with-deps chromium`) and zero impact on a normal local dev machine.

## Constraints & Context

- **CI must stay green and unchanged in behavior.** `.github/workflows/deploy.yaml`
  (`e2e-tests` job) runs on `ubuntu-latest`, caches `~/.cache/ms-playwright`, and
  runs `npx playwright install --with-deps chromium` before `npm run test:e2e`.
  There, Playwright resolves its own correctly-versioned browser. Our fix must be a
  **no-op when the override env var is unset** so CI and local dev fall back to
  Playwright's default resolution.
- **E2E is a required gate** per **ADR-0018 (Reinstate E2E Gate in Pipeline)** —
  `release` `needs: [validate, e2e-tests]`. Don't weaken the gate.
- **ADR-0010 (Cloudflare Pages CI/CD)** governs the pipeline shape; no change
  there.
- This is a **dev-environment / tooling** fix. It does not touch state management,
  persistence, the service layer, component architecture, or routing, so **no new
  ADR is required**. (If we later decide to commit the SessionStart hook as the
  canonical web-session bootstrap, that's a tooling convention, still not an ADR
  category.)
- `package.json` / `package-lock.json` changes require asking the user first
  (AGENTS.md). The recommended approach avoids touching them.

## Options Evaluated

### Option A — Pin `@playwright/test` down to match the env's build (REJECTED)
Downgrade to the Playwright version whose Chromium revision is `1194` (~`1.55.x`).
- ❌ Regresses the pin; loses upstream fixes.
- ❌ Fragile: the web container's pre-baked build will drift again on the next
  image refresh, re-breaking it.
- ❌ Touches `package.json`/lock (needs user sign-off) and risks CI behavior change.

### Option B — Env-driven `executablePath` in `playwright.config.ts` (CORE OF FIX)
Read an optional override from an env var in the config and only set
`launchOptions.executablePath` when it is present:

```ts
const chromiumPath = process.env.PW_CHROMIUM_EXECUTABLE_PATH;
// ...
projects: [{
  name: 'chromium-mobile',
  use: {
    ...devices['iPhone 14'],
    browserName: 'chromium',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
}],
```

- ✅ Unset → identical to today's config → **CI and local dev unaffected**.
- ✅ When set, Playwright launches the given binary directly, bypassing the
  build-number registry lookup that fails.
- ✅ No dependency changes.
- ⚠️ On its own, still requires *something* to set the var each web session — that's
  Option C.

### Option C — SessionStart hook resolves the installed Chromium (RECOMMENDED, with B)
A `.claude/hooks/session-start.sh` (web-only, gated on `$CLAUDE_CODE_REMOTE`) that:
1. Runs `npm install` so `node_modules` exists (the container starts without it).
2. Globs `"$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome` to find the
   **actual** installed binary — **build-number-agnostic**, so a future bump from
   `1194` to some other build keeps working with no edit.
3. Exports the path into the session via `$CLAUDE_ENV_FILE`:
   `echo "export PW_CHROMIUM_EXECUTABLE_PATH=$found" >> "$CLAUDE_ENV_FILE"`.

- ✅ Fully automatic in web sessions; no hand-rolled config.
- ✅ Never runs in CI (CI isn't a Claude web session) and is gated on
  `$CLAUDE_CODE_REMOTE` so it no-ops on a local machine.
- ✅ Registered in `.claude/settings.json`; once merged to the default branch, all
  future web sessions inherit it.

**Decision: B + C together.** B makes the config override-aware and null-safe (the
guarantee CI/local are untouched); C supplies the value automatically in web
sessions. A is rejected.

## Implementation Steps

1. **`playwright.config.ts`** — Add the `PW_CHROMIUM_EXECUTABLE_PATH` read and
   conditionally spread `launchOptions.executablePath` into the `chromium-mobile`
   project's `use` block (snippet above). Keep everything else identical. Verify
   `tsc` is happy.

2. **`.claude/hooks/session-start.sh`** — Create (mode `+x`), synchronous (not
   async, per skill default), idempotent:
   ```bash
   #!/bin/bash
   set -euo pipefail
   [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

   npm install

   if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]; then
     chrome="$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -n1 || true)"
     if [ -n "$chrome" ] && [ -x "$chrome" ]; then
       echo "export PW_CHROMIUM_EXECUTABLE_PATH=$chrome" >> "$CLAUDE_ENV_FILE"
     fi
   fi
   ```
   - Uses `ls -d ... | sort -V | tail -n1` so it picks the newest installed build
     without hardcoding `1194`.
   - Pointing at full `chrome` (not `headless_shell`) covers both headed and
     `--headless=new`; sidesteps the missing `chromium_headless_shell-<N>` that
     triggers the original error.

3. **`.claude/settings.json`** — Create (or merge) the `SessionStart` hook
   registration pointing at `$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh`.
   (Currently only `.claude/skills/` exists; no settings file yet.)

4. **Docs** — Add a short "E2E in web sessions" note to the README (or a
   `e2e/README.md`) explaining the env var + hook, so a human running E2E in a
   non-Claude container knows the override knob exists.

## Validation

- **Web session (this env):**
  - Run the hook directly: `CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh`
    and confirm `PW_CHROMIUM_EXECUTABLE_PATH` is written to `$CLAUDE_ENV_FILE` and
    points at an existing executable.
  - `export PW_CHROMIUM_EXECUTABLE_PATH=<that path>` then `npm run test:e2e` — suite
    launches and runs (no "Executable doesn't exist").
- **CI-parity check (local, var unset):** `unset PW_CHROMIUM_EXECUTABLE_PATH` and
  confirm `playwright.config.ts` produces no `executablePath` (config still
  type-checks; behavior identical to `main`). This is the proof CI is unaffected —
  the override branch is simply not taken.
- **`npm run validate`** (typecheck + lint + unit) stays green — config change is
  trivial and typed.
- Do **not** modify the `e2e-tests` CI job; rely on the unset-var fallback. (If
  desired, a follow-up can confirm CI green on the PR, but no workflow edit is part
  of this task.)

## Out of Scope / Risks

- Not touching `package.json`/lock (no version pin change) — avoids the user
  sign-off gate and any CI dependency drift.
- Async hook mode is **not** used initially (sync guarantees deps + browser path
  are ready before the agent runs E2E); can switch to async later if startup
  latency matters.
- Residual risk: if the web image ever ships **no** `chromium-*` full build (only
  a headless shell), the glob finds nothing and we fall back to the (broken)
  default — the hook degrades to today's behavior rather than masking it. Acceptable;
  revisit if it happens.

## Affected Files

- `playwright.config.ts` (edit)
- `.claude/hooks/session-start.sh` (new)
- `.claude/settings.json` (new)
- `README.md` or `e2e/README.md` (doc note)
- `PLAN.md` / this task file (workflow bookkeeping)
