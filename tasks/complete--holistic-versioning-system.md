---
status: complete
class: complex
e2e_required: false
adr: docs/adrs/0016-holistic-versioning-system.md
clarifications: |
  This plan implements the *proposed* ADR-0016 ("Use semantic-release to
  automate semver bumps; pin semver minor to DB_VERSION"). Implementing it means
  flipping that ADR Proposed → Accepted as part of the work.

  Gates that need the user's explicit go-ahead before the code lands (called out
  inline below, not assumed):
  - Adding six `semantic-release` dev dependencies + the one-time `1.0.0 → 1.4.0`
    bump edits `package.json`/`package-lock.json`. CLAUDE.md: "Ask before making
    any changes to package.json or package-lock.json." This plan does NOT touch
    those files until approved.
  - semantic-release pushes the release commit + tag back to `main`. If `main`
    has branch protection requiring PRs/reviews, the `GITHUB_TOKEN` push will be
    rejected and protection must be relaxed for the bot (or a PAT used). Needs
    confirmation of the current `main` protection rules.

  Deliberate improvements on the literal ADR snippets (decision unchanged, only
  the mechanism is hardened — flagged so it is not a silent deviation):
  - The ADR's CI check reads `require('./src/db/schema.ts')`. That cannot work:
    the project is ESM and `schema.ts` is TypeScript, so `require()` of a `.ts`
    file throws, and the `npx tsx` fallback pulls in an uninstalled dep at CI
    time. Replaced with a committed, dependency-free Node script
    (`scripts/check-version-db-alignment.mjs`) that regex-extracts `DB_VERSION`
    from `schema.ts` — runnable locally and in CI, and unit-testable.
  - The ADR shows the invariant as an inline shell step. We extract it to that
    script so the same check runs locally (wired into `npm run validate`) and is
    covered by a unit test.
---

# Task: Implement ADR-0016 — automate semver with semantic-release and pin semver minor to DB_VERSION

## Problem

`package.json` version (`1.0.0`) and `DB_VERSION` (`4`, in `src/db/schema.ts`)
drift independently. The Settings → About panel therefore shows a version that
says nothing about schema state, and nothing in CI prevents a schema-migration
PR from shipping with no version signal at all. ADR-0016 (Proposed) fixes this
by (a) automating semver from the conventional commits the repo already writes
via **semantic-release**, and (b) making `minor(appVersion) === DB_VERSION` an
invariant enforced in CI.

## Relevant ADRs

- **ADR-0016 (this task, Proposed → Accepted).** The decision being implemented.
  Implementation flips its `Status` to `Accepted` (a Proposed record is not yet
  immutable; this is the one allowed transition, not an edit of an accepted ADR).
- **ADR-0014 (PWA versioning & update strategy, Accepted).** Not contradicted —
  extended. `AppVersionPanel` already renders `__APP_VERSION__` (injected from
  `package.json` by Vite `define`, `vite.config.ts:18`). After this task that
  string becomes `v1.4.x` and carries the schema number for free. No structural
  change to the panel or to `usePwaUpdate`.
- **ADR-0010 (GitHub Actions + Cloudflare Pages CI/CD, Accepted).** Not
  contradicted — extended. We add a `release` job to `.github/workflows/deploy.yaml`
  and a version-alignment gate; the `validate → … → build-and-deploy` ordering
  ADR-0010 mandates is preserved (release slots between them; deploy still never
  lands if a gate fails). Note: the live workflow currently has only
  `validate → build-and-deploy` (no `e2e-tests` job that ADR-0010's prose
  mentions); this task does not add E2E and leaves that discrepancy alone.
- **ADR-0002 (IndexedDB, Accepted).** `DB_VERSION` is the IDB schema version and
  must remain a monotonically increasing positive integer. This is exactly why
  ADR-0016 rejected "derive DB_VERSION from semver" (option 3) and instead makes
  semver *follow* DB_VERSION. Nothing here changes the migration model in
  `idbClient.ts`; `DB_VERSION` stays the source of truth and the bump stays
  manual and append-only.

## Decision recap (from ADR-0016)

- semantic-release reads conventional commits on `main` → bumps `package.json`,
  tags, generates release notes, commits the bump back to `main` with `[skip ci]`.
- `feat:` ⇒ minor bump; `fix:` ⇒ patch; `BREAKING CHANGE:` ⇒ major (manual
  coordination). A schema migration ships under `feat(db):`.
- Invariant: `semver.minor(package.json.version) === DB_VERSION`, asserted in CI
  before deploy. Patch releases between migrations never disturb it.
- One-time seed: `package.json` `1.0.0 → 1.4.0` to align with `DB_VERSION 4`.

## Approach (phased)

### Phase 0 — Accept the ADR
1. `docs/adrs/0016-holistic-versioning-system.md` — `Status: Proposed` → `Accepted`.

### Phase 1 — Version-alignment check (no dependency, no approval needed)
2. **New `scripts/check-version-db-alignment.mjs`** — pure Node ESM, zero deps:
   - Read `package.json` `version`; take `minor = version.split('.')[1]`.
   - Read `src/db/schema.ts` as text; extract `DB_VERSION` with
     `/export const DB_VERSION\s*=\s*(\d+)/`. (Regex, not import — avoids needing
     a TS loader in plain Node.)
   - Exit `0` when equal; print `Version drift: semver minor (X) ≠ DB_VERSION (Y)`
     and exit `1` otherwise. Factor the compare into an exported
     `assertVersionAlignment({ version, schemaSource })` helper so it is unit-testable
     without spawning a process.
3. **New `scripts/__tests__/check-version-db-alignment.test.ts`** — Vitest unit
   tests for the helper: aligned passes; `1.4.1` vs `DB_VERSION 4` passes (patch
   doesn't matter); `1.4.x` vs `DB_VERSION 5` fails; malformed schema source
   throws a clear error. (Vitest `include` is `src/**/*.test.ts?(x)` — see
   `vite.config.ts:65` — so either extend the glob to cover `scripts/**` or place
   the test under `src/`; prefer extending the glob and keeping the test beside
   the script. Glob change is a `vite.config.ts` edit, not `package.json`.)
4. **`npm run validate`** — wire the check in so drift is caught locally too. The
   `validate` script lives in `package.json`, so this specific line is part of
   the **package.json-approval gate** (Phase 3); until approved, the check runs
   only via the CI step (Phase 2) and on demand via `node scripts/check-version-db-alignment.mjs`.

### Phase 2 — CI: invariant gate + semantic-release job (`.github/workflows/deploy.yaml`)
5. Add an **alignment gate step** to the `validate` job, before `npm run validate`:
   ```yaml
   - name: Assert semver minor equals DB_VERSION
     run: node scripts/check-version-db-alignment.mjs
   ```
   (Replaces the ADR's `require('./src/db/schema.ts')` snippet — see frontmatter.)
6. Add a **`release` job** that runs semantic-release:
   - `needs: [validate]`; `build-and-deploy` becomes `needs: [release]`.
   - Job-level `permissions: { contents: write, issues: write, pull-requests: write }`
     so the bot can push the bump/tag and comment on released PRs/issues.
   - Steps: checkout (`fetch-depth: 0`, full history is required for
     commit-analysis), setup-node 24 + `npm ci`, then `npx semantic-release` with
     `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
7. **Sequencing fix (wrinkle the ADR doesn't address).** semantic-release commits
   the bumped `package.json` to `main` with `[skip ci]`, so that commit will not
   retrigger the pipeline. But `build-and-deploy` does `actions/checkout@v4` at the
   *triggering* SHA — the pre-bump commit — so a naive setup would deploy a build
   whose `__APP_VERSION__` lags one release behind the git tag. Fix: have
   `build-and-deploy` check out the post-release `main` HEAD:
   ```yaml
   - uses: actions/checkout@v4
     with: { ref: main, fetch-depth: 0 }
   ```
   so `vite.config.ts` reads the freshly-bumped `package.json`. (Confirm at
   implementation time that the release commit is visible to the dependent job;
   if not, fall back to passing `nextRelease.version` out of the `release` job as
   an output and overriding the Vite `define` at build time.)

### Phase 3 — semantic-release config + deps + initial bump (package.json-approval gate)
> Everything in this phase edits `package.json`/`package-lock.json` and so is
> blocked on explicit user approval per CLAUDE.md. Present as a single batch.
8. **New `.releaserc.json`** at repo root — exactly the ADR-0016 config: branches
   `["main"]`; plugins `commit-analyzer`, `release-notes-generator`, `npm`
   (`npmPublish:false` is implied by `private:true` in `package.json`, but set it
   explicitly to be safe), `github` (`assets: []`), and `git`
   (assets `["package.json", "package-lock.json"]`, message
   `chore(release): ${nextRelease.version} [skip ci]`).
9. **dev dependencies** (`npm i -D`): `semantic-release`, `@semantic-release/git`,
   `@semantic-release/npm`, `@semantic-release/github`,
   `@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`.
10. **One-time initial alignment bump:** `package.json` `version` `1.0.0 → 1.4.0`,
    committed as `feat(db): align initial semver minor with DB_VERSION 4`. After
    this, semantic-release owns every subsequent bump.
11. Add `"verify:version": "node scripts/check-version-db-alignment.mjs"` and fold
    it into `validate` (`... && npm run verify:version`) so local + CI use one path.

### Phase 4 — Docs
12. `docs/releases.md` (referenced by ADR-0010) — document the release flow:
    conventional-commit → bump mapping, the `feat(db):` rule for schema PRs, how
    to do a deliberate major (`minor`→0 + matching `DB_VERSION` migration comment),
    and how to read `v1.5.2` as "DB schema 5, patch 2." If `docs/releases.md`
    doesn't exist yet, create it; otherwise append a "Versioning" section.

## Files to change

| File | Change |
| --- | --- |
| `docs/adrs/0016-holistic-versioning-system.md` | `Status: Proposed → Accepted`. |
| `scripts/check-version-db-alignment.mjs` | **New.** Dependency-free alignment check + exported helper. |
| `scripts/__tests__/check-version-db-alignment.test.ts` | **New.** Unit tests for the helper. |
| `vite.config.ts` | Extend Vitest `include` to cover `scripts/**/*.test.ts`. |
| `.github/workflows/deploy.yaml` | Alignment gate step; new `release` job; `build-and-deploy` checks out post-release `main`. |
| `.releaserc.json` | **New.** semantic-release config (ADR-0016). ⚠ approval gate. |
| `package.json` | +6 dev deps; `version 1.0.0 → 1.4.0`; `verify:version` script; `validate` chains it. ⚠ approval gate. |
| `package-lock.json` | Regenerated by `npm i -D`. ⚠ approval gate. |
| `docs/releases.md` | Document the versioning/release workflow. |

## Implementation checklist

- [ ] ADR-0016 flipped to Accepted.
- [ ] `check-version-db-alignment.mjs` passes for current real values once bumped
      (`minor(1.4.0)=4 === DB_VERSION 4`) and fails on injected drift.
- [ ] Unit tests for the alignment helper green under Vitest.
- [ ] CI `validate` job runs the gate before `npm run validate`.
- [ ] `release` job added with correct `permissions` and `needs` wiring; deploy
      builds from the post-release version (no one-release lag).
- [ ] **[approval]** `.releaserc.json` + dev deps + `1.4.0` bump landed.
- [ ] `verify:version` wired into `validate`.
- [ ] `docs/releases.md` documents the flow.
- [ ] `npm run validate` clean.

## Tests

- **Unit (Vitest):** the alignment helper — aligned passes; patch-only difference
  (`1.4.7` vs `4`) passes; minor mismatch (`1.5.0` vs `4`) fails with the drift
  message; unpar. malformed `schema.ts` source throws.
- **No new E2E.** Behaviour is unchanged for the user; `AppVersionPanel`'s
  existing test (`__tests__/AppVersionPanel.test.tsx`) already asserts against the
  injected `__APP_VERSION__` and keeps passing once the value is `1.4.0`.
- **Manual CI validation (post-merge):** push a `fix:` commit → confirm a patch
  release + tag + back-commit on `main` with `[skip ci]`, no retrigger loop, and a
  deploy whose About panel matches the new tag. Then a `feat(db):` commit that
  bumps `DB_VERSION 4 → 5` *without* a matching version → confirm the gate fails
  the job (proves the invariant bites).

## Out of scope

- **commitlint / a commit-msg hook.** semantic-release tolerates non-conventional
  commits (treats them as no-release), and the CI invariant is the safety net.
  Enforcing commit format at author time is a separate, optional follow-up.
- **Changing the IDB migration model** or auto-bumping `DB_VERSION`. `DB_VERSION`
  stays a manual, append-only edit in `schema.ts`/`idbClient.ts` (ADR-0002).
- **Adding the `e2e-tests` job** ADR-0010's prose references but the live workflow
  lacks. Reconciling that is its own task.
- **Backfilling git tags** for historical `1.0.0` builds — semantic-release starts
  fresh from the `1.4.0` baseline.

## Open items to confirm before building

1. **package.json approval** — green-light to add the six semantic-release dev
   deps, bump `1.0.0 → 1.4.0`, and add the `verify:version` script (Phase 3).
2. **`main` branch protection** — does it require PRs/approvals? If so, the
   `GITHUB_TOKEN` release push will be blocked; decide between relaxing protection
   for the release bot or supplying a PAT. (semantic-release cannot bump if it
   can't push to `main`.)
3. **Deploy-from-post-release-version mechanism** — confirm the `checkout ref: main`
   approach picks up the `[skip ci]` release commit within the same run; otherwise
   adopt the `nextRelease.version` build-output fallback (Phase 2, step 7).
