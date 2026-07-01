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
