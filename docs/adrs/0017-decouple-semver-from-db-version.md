# Decouple app semver from DB_VERSION; keep semantic-release, surface both numbers independently

## Status

Accepted

Supersedes [ADR-0016](0016-holistic-versioning-system.md).

## The Problem

ADR-0016 required `semver.minor(appVersion) === DB_VERSION` enforced in CI, but
the invariant was never implemented and the two numbers have already drifted
(`package.json` is `1.8.0` while `DB_VERSION` is `5`), so the coupling rule is
both unenforced and already violated.

## The Solution

Let app semver and `DB_VERSION` version independently — semantic-release owns the
product version from conventional commits, `DB_VERSION` stays a private
monotonic integer owned by `schema.ts` — and display both numbers in Settings so
the diagnostic value of ADR-0016 is preserved without the coupling.

## Options Considered

1. **Keep ADR-0016 and actually implement the CI invariant** — backfill the
   `minor === DB_VERSION` check and force-realign `package.json` to `1.5.0`.
   Rejected: it conflates two values with different semantics and different
   constraints (see Rationale), forces a misleading version bump to satisfy a
   self-imposed rule, and creates a standing CI failure mode every time a `fix:`
   release nudges the patch component past a schema migration boundary.

2. **Semantic-release only; `DB_VERSION` stays independent** (selected) —
   conventional commits drive semver automatically; `DB_VERSION` is incremented
   by hand in `schema.ts` only when a migration is added; the two never have to
   agree. A lightweight CI guard ensures a `DB_VERSION` change is always
   accompanied by at least a `feat`-level commit so schema migrations never ship
   as a silent patch, and the Settings panel surfaces both numbers for support.

3. **Derive `DB_VERSION` from semver at build time** — rejected in ADR-0016 and
   still rejected here: IndexedDB's version argument must be a positive integer
   that only ever increases, and binding it to a value semantic-release can reset
   to `0` on a major bump introduces a migration-regression hazard.

## Rationale

The two numbers answer different questions and obey different rules, so forcing
them to be equal was always going to fight the tools:

- **App semver is a product-facing, SemVer-compliant signal.** Its major/minor/
  patch components communicate user-visible change, and semantic-release derives
  it deterministically from conventional commits the team already writes. A
  patch release between two schema migrations is normal and correct.
- **`DB_VERSION` is an internal IndexedDB contract.** It must be a strictly
  increasing positive integer; its only job is to trigger the right `upgrade()`
  migration path. It has no business resetting to `0` on a product major bump,
  and most product releases (copy, styling, UX) touch it not at all.

Coupling them meant every `fix:` patch released between migrations risked
breaking the invariant, and a true major bump (semver minor → `0`) would have
demanded a `DB_VERSION` reset that IndexedDB forbids. The drift already in the
repo (`1.8.0` vs `5`) is the empirical proof: the rule was unenforceable in
practice, so the honest move is to stop pretending the numbers are one number.

Decoupling does **not** sacrifice the one genuinely useful property ADR-0016 was
chasing — a single number a user can read off the Settings screen to start
migration troubleshooting. We keep that by displaying `DB_VERSION` alongside the
app version in the About panel. A support interaction now reads "Shoop v1.8.0,
DB schema 5" directly, which is *more* precise than inferring schema state from a
minor component, and it stays correct no matter how the two evolve.

We retain semantic-release unchanged (ADR-0010 CI/CD, ADR-0014 PWA versioning
both assume it) and add only a soft guard: a schema migration is a meaningful
change that should never reach users as an invisible patch, so CI requires that
any PR touching `DB_VERSION` carry at least one `feat`/`feat(db):` commit. That
preserves the "a migration is at least a minor release" intent of ADR-0016 as a
*floor on visibility*, without asserting numeric equality.

## Notes

### Conventional commit → version bump mapping (decoupled)

| Commit type | semver bump | `DB_VERSION` |
|---|---|---|
| `fix:` / `fix(scope):` | patch | unchanged |
| `feat:` / `feat(scope):` | minor | unchanged unless the change adds a migration |
| `feat(db):` | minor | incremented by hand in `schema.ts` when a migration is added |
| `BREAKING CHANGE:` footer | major | unchanged (a product major bump does not reset schema) |

`DB_VERSION` is incremented **only** by the author of a migration, append-only,
as part of the same PR that adds the new `if (oldVersion < N)` case in
`src/db/idbClient.ts` (per the existing migration convention). There is no
back-pressure from semver onto `DB_VERSION` or vice versa.

### CI guard (replaces the ADR-0016 invariant check)

Replace the never-implemented equality assertion with a visibility floor in the
`validate` job of `.github/workflows/deploy.yaml`. The workflow triggers on
`push` to `main`, so the guard diffs the pushed range (`HEAD^..HEAD`, which spans
all commits of a merge) and, if `DB_VERSION` changed, requires a `feat`-level
commit so semantic-release emits at least a minor bump:

```yaml
- name: DB migrations must ship at least a minor release
  run: |
    if git diff HEAD^ HEAD -- src/db/schema.ts \
         | grep -qE '^\+export const DB_VERSION'; then
      if ! git log HEAD^..HEAD --format='%s%n%b' \
           | grep -qE '^feat(\(.+\))?!?:'; then
        echo "DB_VERSION changed but no feat: commit in range — a migration would ship as a silent patch."
        exit 1
      fi
    fi
```

The `validate` job's `checkout` uses `fetch-depth: 0` so the merge commit range
resolves.

This is advisory pressure toward good commit hygiene, not a correctness gate on
the two numbers matching.

### UX — Settings "About" panel

`AppVersionPanel` currently renders only `Shoop v{version}` (from
`APP_VERSION` in `src/lib/appVersion.ts`). Extend it to also display the schema
version, e.g. a muted line `DB schema v{DB_VERSION}`. Pass `DB_VERSION`
(imported from `@/db/schema`) into the panel via its container rather than
importing DB internals into the molecule directly, keeping the molecule free of
data-layer coupling per the Atomic Design boundaries. This restores — and
sharpens — the troubleshooting affordance ADR-0016 justified via coupling.

### Migration / adoption steps

1. No version realignment. `package.json` stays at its semantic-release-managed
   value; `DB_VERSION` stays at `5`. The existing drift is now *correct by
   definition*, not a violation.
2. Leave `.releaserc.json` as-is — semantic-release config is unaffected.
3. Add the CI visibility guard above (optional but recommended).
4. Update `AppVersionPanel` (and its container + test) to surface `DB_VERSION`.
