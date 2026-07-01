# Backlog: ADR Granularity Audit

Audit the current Architecture Decision Records in `docs/adrs/` for excessive
granularity. Over successive phases the ADR set has grown to ~29 records, and some
decisions look finer-grained than the "one significant, hard-to-reverse decision per
record" bar — for example per-phase Eat-tab records and several closely-related
visual/identity records.

Deliverable: a review that (a) flags ADRs that are too granular or overlapping,
(b) proposes which to consolidate or retire, and (c) recommends a right-sizing
convention for future records — all while respecting the immutability rules
(ADRs are superseded via a new record + a `Status` edit, never rewritten).

Promoted to `active--` with a full plan before any change is made.

## Findings (2026-07-01 review)

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
