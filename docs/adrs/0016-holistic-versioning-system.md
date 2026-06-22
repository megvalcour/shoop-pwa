# Use semantic-release to automate semver bumps; pin semver minor to DB_VERSION

## Status

Accepted

## The Problem

The app version (`package.json`) and the DB schema version (`DB_VERSION`) evolve
independently — `DB_VERSION` is now 4 while the displayed app version is still
`1.0.0` — so the version shown in Settings carries no information about schema
state, and there is no automated gate preventing a deploy where the two drift
silently.

## Options Considered

1. **Manual semver with no enforcement** (status quo) — developer bumps
   `package.json` by hand; `DB_VERSION` is a separate integer bumped by hand;
   CI never checks alignment. Rejected: the version freeze from `1.0.0` through
   four schema migrations shows this is not self-correcting in practice.

2. **Semantic-release only, DB_VERSION stays independent** — conventional
   commits drive automatic minor/patch bumps but `DB_VERSION` and the semver
   minor remain uncoupled. Rejected: this automates one half of the problem but
   leaves the alignment gap open; a schema migration PR can still ship without a
   corresponding semver signal.

3. **Derive DB_VERSION from the semver minor at build time** — read
   `package.json` minor at runtime and use it as the IDB version argument.
   Rejected: IDB version must be a positive integer that only ever increases;
   tying it to a component that semantic-release can reset to `0` on a major
   bump creates a migration regression risk that is hard to reason about.

4. **Use semantic-release; make `semver.minor(appVersion) === DB_VERSION`;
   enforce the invariant in CI** (selected) — semantic-release automates
   version bumps from conventional commits already in use; a `feat(db):` or
   `feat:` commit touching `src/db/schema.ts` triggers a minor bump; a
   lightweight CI step validates that `minor(package.json.version) ===
   DB_VERSION` before every deploy. Both numbers stay equal by construction, and
   the violation is caught in CI before it ever reaches `main`.

## Rationale

The project already writes conventional commits (`feat:`, `fix:`, `docs:`,
etc.), so semantic-release requires no workflow change for developers — it
just acts on the commits that already exist. The alignment rule is simple
enough to write in ten lines of shell and adds a second line of defence: if a
developer forgets to use a `feat:` prefix on a schema-migration commit,
semantic-release emits a patch bump, the invariant check sees
`minor(1.4.1) = 4 ≠ 5 = DB_VERSION` and fails the CI job before the PR lands.
The symmetry also makes the Settings "About" panel meaningful: a user running
`v1.5.x` knows they are on DB schema 5, so any migration troubleshooting starts
with a single number.

Choosing `minor` (not `major` or `patch`) as the DB_VERSION carrier matches
the semantic weight of a schema migration: it is a backwards-incompatible
internal change that warrants more than a patch but is not the kind of
user-visible paradigm shift that justifies resetting to `x.0`. Patch releases
(`fix:` commits between schema migrations) freely increment the patch component
without disturbing the invariant.

When a true major-version bump is eventually warranted (large user-facing
redesign, etc.), the release manager resets `minor` to `0` as part of that
deliberate decision and sets `DB_VERSION` to match via a migration comment in
`schema.ts`. This is rare enough to handle manually.

## Notes

### Conventional commit → version bump mapping

| Commit type | semver bump | DB_VERSION changes? |
|---|---|---|
| `fix:` / `fix(scope):` | patch | no |
| `feat:` / `feat(scope):` | minor | yes, if `schema.ts` is touched |
| `feat(db):` | minor | yes (explicit signal) |
| `BREAKING CHANGE:` footer | major | manual coordination required |

Any PR that increments `DB_VERSION` in `schema.ts` **must** include at least
one `feat:` commit (use `feat(db):` as the canonical scope). Semantic-release
will bump `minor` from `N` to `N+1`, and the invariant check will confirm
`minor(new version) === new DB_VERSION`.

### CI invariant check

Add a step to the `validate` job in `.github/workflows/deploy.yaml` before
`npm run validate`:

```yaml
- name: Assert semver minor equals DB_VERSION
  run: |
    APP_MINOR=$(node -p "require('./package.json').version.split('.')[1]")
    DB_VER=$(node -p "require('./src/db/schema.ts').DB_VERSION" 2>/dev/null || \
             npx tsx -e "import { DB_VERSION } from './src/db/schema.ts'; console.log(DB_VERSION)")
    if [ "$APP_MINOR" != "$DB_VER" ]; then
      echo "Version drift: semver minor ($APP_MINOR) ≠ DB_VERSION ($DB_VER)"
      exit 1
    fi
```

### semantic-release configuration

Add `.releaserc.json` to the repository root:

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/npm",
    ["@semantic-release/github", { "assets": [] }],
    ["@semantic-release/git", {
      "assets": ["package.json", "package-lock.json"],
      "message": "chore(release): ${nextRelease.version} [skip ci]"
    }]
  ]
}
```

`@semantic-release/npm` writes the bumped version back to `package.json`
(without publishing to npm). `@semantic-release/git` commits the updated
`package.json` back to `main` so the next build always reads the authoritative
version. The `[skip ci]` trailer prevents the release commit from retriggering
the pipeline.

Required GitHub Actions secret: `GITHUB_TOKEN` (already available).
Required npm packages (dev): `semantic-release`, `@semantic-release/git`,
`@semantic-release/npm`, `@semantic-release/github`,
`@semantic-release/commit-analyzer`, `@semantic-release/release-notes-generator`.

### UX — Settings "About" panel

The existing `AppVersionPanel` molecule already reads `__APP_VERSION__` (injected
from `package.json` at build time, per ADR-0014). With this ADR in effect it will
display a version like `v1.5.2` that unambiguously communicates "DB schema 5,
second patch on top of it." No structural changes to the About panel are required
beyond updating any hardcoded copy that references `1.0.0`.

### Initial migration

Because `DB_VERSION` is currently `4` and `package.json` is `1.0.0`, the first
act of adopting this ADR is a one-time manual bump: `package.json` version →
`1.4.0`, committed as `feat(db): align initial semver minor with DB_VERSION 4`.
Semantic-release takes over for all subsequent releases.
