# Backlog: ADR Granularity Audit

Audit the current Architecture Decision Records in `docs/adrs/` for excessive
granularity. Over successive phases the ADR set has grown to 28 numbered records
(0001–0024, 0026–0029; 0025 was never issued), and many decisions are finer-grained
than the "one significant, hard-to-reverse decision per record" bar in AGENTS.md
("state management strategy, data persistence/caching, API/service layer patterns,
component architecture boundaries, routing structure" — "Tailwind CSS or Atomic
Design are ADRs; a specific color theme is not").

Deliverable: a review that (a) identifies which ADRs actually govern one of those
five categories of decision and should stay, (b) recommends outright **deletion**
of every record that doesn't — not just consolidation — since each one is bloat
once it's not load-bearing documentation, and (c) flags load-bearing records that
bury the decision under granular implementation detail that should be trimmed or
moved out of the ADR body.

Promoted to `active--` with a full plan before any change is made. **Deletion of an
already-Accepted ADR is in tension with the immutability rule** ("ADRs are
immutable once accepted... never edit the body"); the promoted plan must resolve
this explicitly per record (see "Immutability caveat" below) rather than silently
deleting accepted files.

## Findings (2026-07-01 aggressive pass — supersedes the 2026-07-01 first pass below)

Full pass through all 28 ADRs. Bar applied: does the record fix a decision in one of
the five governing categories, at a level that would actually be expensive to
reverse? If not, it's bloat regardless of how well-written it is.

### Keep as-is (16) — clean, load-bearing, correctly scoped

`0001` (single-repo Vite), `0002` (IndexedDB as sole persistence layer), `0003`
(HuggingFace Transformers.js for in-browser matching — establishes the in-browser
inference pattern later records build on), `0004` (Zustand + TanStack Query split),
`0005` (Atomic Design boundaries), `0006` (React Router v7 library mode), `0009`
(on-demand shopping lists replacing weekly model), `0012` (Shop-as-root redirect
routing), `0013` (Web Worker aisle inference), `0014` (prompt-based PWA update
strategy — governs the offline-first update/reload contract, not just a UI
affordance), `0015` (store-agnostic items + `item_locations` + active-store
preference), `0019` (serverless fetch proxy — first server-side surface,
correctly bounded), `0026` (Eat IndexedDB stores + migration), `0027` (Eat
nutrition data source — second server-side surface), `0028` (Eat section-scoped
theme mechanism), `0029` (Eat weekly plan model + scoring contract).

All of these sit squarely in persistence, state-management, service/API-layer,
component-boundary, or routing territory, at the mechanism level (not the value
level). `0028` in particular is the model to imitate: it fixes the `data-theme`
scoping mechanism and explicitly defers hex values to implementation — contrast
with `0008`/`0020` below, which do the opposite.

### Keep, but trim granular implementation notes (6)

These govern a real decision but carry detail that will drift out from under the
ADR the first time it's touched, or reads like a runbook/postmortem instead of a
rationale:

- **`0011`** (layered lexical + semantic aisle matching) — the layering decision is
  legitimate and load-bearing. The Notes pin exact tunables (`THRESHOLD = 0.5`,
  `TOP_K = 5`) as if they were part of the decision. These are knobs that will be
  retuned independently of the architecture; move them to a code comment next to
  the constants in `classifier.ts`, not the ADR.
- **`0017`** (decouple semver from `DB_VERSION`) — the decoupling decision and the
  "a migration must ship at least a `feat:` commit" invariant are genuinely
  significant (CI enforces this per AGENTS.md). But the ADR embeds a full CI YAML
  block and inline shell script. Duplicating `.github/workflows/deploy.yaml` in
  the ADR body means it drifts the first time the guard is edited. State the
  invariant and link the workflow file; don't carry a copy.
- **`0021`** (recipe ingredient normalization) — the decision (drop quantity/unit
  extraction entirely, default to ×1) is durable and correctly scoped. At 184
  lines the record reads as a bug postmortem: verbatim regex traces, a
  character-by-character walkthrough of why two prior patches failed, and a table
  of failing/passing strings. That belongs in a commit message or the test file's
  regression comments, not the ADR. Trim to problem → decision → rationale;
  drop the reconstructed regex trace.
- **`0018`** (reinstate E2E gate) — legitimate pipeline-shape decision (gate
  `release`, not just `build-and-deploy`), but the Notes drift into
  implementation bookkeeping (cache key strategy, reporter config, artifact
  retention days) that belongs in the workflow file's own comments.
- **`0010`** (Cloudflare Pages CI/CD) — the hosting/deploy-target decision itself
  (Cloudflare Pages over Netlify/Vercel/manual) is legitimate and, unlike the
  items above, still current — `0018` only reinstates an E2E gate in the
  pipeline, it doesn't change where the app deploys. But `0010`'s `Status` reads
  `Superseded by ADR-0018`, which overstates what `0018` actually replaced (the
  three-job pipeline *shape*, not the hosting choice). Flag as a **status
  correction**, not a content problem: `0018`'s own Notes already say it
  "supersedes ADR-0010" for the pipeline-shape portion only — the `Status` field
  on `0010` should say so precisely (e.g. `Superseded by ADR-0018 (pipeline shape
  only); hosting choice remains in force`) rather than reading as a full
  supersede. Do not delete or trim `0010`'s body.
- **`0024`** (user-authored stores) — on reflection this is thinner than it looks:
  it explicitly "rides ADR-0015 with no schema change" and its Rationale is really
  a restatement of existing decisions (ADR-0015 catalog reuse, ADR-0011/0013
  matcher). What's left after that — id/slug minting rules, dedup suffixing,
  reset-wipes-custom-stores behavior — is feature-behavior spec, not architecture.
  **Borderline: if promoted, default to retiring this one entirely** (see below)
  rather than trimming, since there's no residual architectural decision once the
  "rides 0015" framing is stripped out.

### Retire — recommend outright deletion (6)

None of these fix a decision in the five governing categories. Each is either a
dependency/cosmetic choice (the AGENTS.md "specific color theme is not an ADR"
example, almost verbatim) or a signature/visual-polish changelog entry disguised as
an ADR:

- **`0007`** (Font Awesome Free for icons) — an icon-library pick, same weight
  class as a color theme, not Tailwind/Atomic-Design. Nothing about component
  boundaries, state, persistence, API layer, or routing turns on this. Cheaply
  reversible; doesn't need a permanent record.
- **`0008`** (design tokens + warm-jewel-tone identity, superseded by `0020`) —
  already dead. Even setting death aside, the body is 80% a palette/typography
  value table — the literal "specific color theme" example AGENTS.md says isn't
  an ADR. The one durable idea (CSS custom properties in `@theme` as the token
  mechanism) is restated cleanly and currently in `0020`/`0028`; nothing here is
  load-bearing anymore.
- **`0016`** (holistic versioning system, superseded by `0017`) — 148 lines of CI
  YAML, a `.releaserc.json`, and a bump-mapping table, all in service of a
  coupling rule that `0017` fully reverses (it doesn't refine `0016`, it says the
  opposite: don't couple semver to `DB_VERSION`). `0017` restates all the context
  a reader needs. Nothing here is still true.
- **`0020`** (blue Material visual identity) — same shape problem as `0008`, one
  level up: roughly two-thirds of the body is palette/shadow/typography value
  tables. Its *mechanism* content (tokens in `@theme`, monochrome-over-competing-
  accent as the visual strategy) is a one-paragraph idea; the tables are not a
  decision, they're a copy of `src/index.css`. Complication: `0020` is currently
  the live palette source cited by `0022`/`0023`/`0028` as "in force" — see
  "Immutability caveat" below before deleting this one.
- **`0022`** (aisle-placard signature) / **`0023`** (inline aisle headers) — a
  two-hop chain that only walks back a header's visual treatment (rail → placard
  tile → inline text) and exactly when swipe-delete red is visible. No state,
  persistence, API/service, component-boundary, or routing content — this is a
  UI-polish changelog with "Options Considered" formatting bolted on. The one
  arguably-durable fragment — "swipe-to-delete is hand-rolled with Pointer
  Events, no new dependency" (`0022`) — is a real, if minor, service-layer choice
  (build vs. depend). If kept at all, it should be folded into `0005` (Atomic
  Design) as a one-line convention, not carry two full chained ADRs.

### Open question carried over: per-phase Eat records

Per the original one-liner, `0026`–`0029` were flagged as a possible
over-granularity risk. Confirmed on this pass: each fixes a distinct,
non-overlapping decision (schema, data source, theme scoping, plan/scoring model)
and none is cosmetic. **Not** a consolidation candidate — all four stay in the
Keep list above.

### Immutability caveat — must be resolved during promotion, not silently

AGENTS.md permits exactly one edit to an Accepted ADR: flipping `Status` to
`Superseded by ADR-NNN`. It does not sanction deleting an Accepted record's file.
Several retire candidates above (`0007`, `0020`, `0024`) are currently `Accepted`
(not already-superseded), so "delete" for those specifically means:

1. Write a new, deliberately minimal ADR that captures only the residual
   mechanism worth keeping (e.g., a slimmed `0020`-replacement stating "monochrome
   token ramp in `@theme`, values live in `src/index.css`" with no value tables).
2. Flip the old record's `Status` to `Superseded by ADR-NNN`.
3. Only then is the old file's content fully absorbed — at which point deleting
   the superseded file (vs. leaving an empty husk) is a call for the user, since
   git history preserves it either way and the AGENTS.md rule is about not
   rewriting *live* guidance, not about permanent file retention.

`0008` and `0016` are already `Superseded`, so they carry no such constraint —
those two can be deleted outright with no new record needed.

### Right-sizing convention (recommend adding to AGENTS.md when promoted)

- An ADR states a decision and, if needed, the *mechanism* by which it's enforced.
  It does not carry: value tables (colors, fonts, shadows), tunable constants,
  CI YAML/scripts (link to the file instead), or regex/bug-trace postmortems.
- If an ADR's "Notes" section is longer than its "Rationale," that's a signal the
  record needs trimming before it's accepted, not after.
- A visual/UI change is an ADR only if it changes a *mechanism* (e.g., how theming
  cascades, per `0028`) — never for the value it renders (per `0008`/`0020`) or a
  one-off signature restyle (per `0022`/`0023`).

---

## Findings (2026-07-01 first pass — superseded by the pass above)

Full pass through all 24 ADRs against the bar in AGENTS.md ("significant, high-level
decisions only — e.g. Tailwind CSS or Atomic Design are ADRs; a specific color theme
is not").

### Not architecturally significant — candidates to retire/fold in

- **ADR-0022** (aisle-placard signature) / **ADR-0023** (inline aisle headers) — two
  chained records that only walk back a header's visual treatment (rail → placard
  tile → inline text) and exactly when the swipe-delete red is visible. No state
  management, persistence, API/service, component-boundary, or routing content.
  ADR-0022's swipe-to-delete *mechanism* decision (hand-rolled gesture, no new
  dependency) is legitimate; the "Signature" sections in both are UI-polish
  changelog entries, not ADRs.
- **ADR-0008** / **ADR-0020** (visual identity) — each conflates a durable pattern
  decision (CSS custom properties in Tailwind's `@theme` as the single token
  source) with a full palette/typography/shadow value table and a "signature"
  visual motif. The value tables are the literal "monochromatic blue theme" example
  of what should not be an ADR; the token *mechanism* is the only part worth
  keeping, and it's already restated cleanly in ADR-0028.

### Legitimate decision, but bloated with ephemeral implementation detail

- **ADR-0016** (superseded) / **ADR-0017** — embed full CI YAML/shell scripts and
  npm package lists inline. The decision (decouple semver from `DB_VERSION`, gate
  migrations in CI) is sound; duplicating the workflow script in the ADR body means
  it will drift from `.github/workflows/deploy.yaml` the first time the guard is
  edited. Should describe the invariant and reference the file, not carry a copy.
- **ADR-0021** (recipe ingredient normalization) — the decision (drop quantity/unit
  extraction entirely) is durable and correctly scoped, but the record reads like a
  bug postmortem (verbatim regex traces, line-by-line parser walkthrough) rather
  than a high-level rationale.
- **ADR-0011** (layered aisle matching) — core layering decision is fine; the Notes
  pin exact tunables (`THRESHOLD = 0.5`, `TOP_K = 5`) as if part of the decision —
  these are knobs that will drift independently and shouldn't need the ADR updated
  (or left stale) when tuned.

### Reviewed and fine as-is

0001–0007, 0009, 0012, 0013, 0015, 0018, 0019, 0024, 0026–0029 stay within the five
significant categories (persistence, state mgmt, service/API patterns, component
boundaries, routing) at a high level. ADR-0028 (Eat section-scoped theme) is a good
model even though it's about theming — it fixes only the `data-theme` scoping
*mechanism* and explicitly defers hex values to implementation, unlike 0008/0020.

### Open question for promotion

Per-phase Eat-tab records (0026/0027/0028/0029) were flagged in the original
one-liner as a possible over-granularity risk, but on review each carries a distinct,
non-overlapping decision (schema, data source, theme scoping, plan/scoring model) —
they did not come up as candidates to consolidate in this pass. Worth a second look
specifically on that question when this is promoted to `active--`.
