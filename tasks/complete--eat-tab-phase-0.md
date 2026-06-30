---
epic: eat-tab
phase: 0
status: planning
class: lightweight
e2e_required: false
clarifications: |
  Phase 0 of the "Eat" tab epic (`tasks/backlog--eat-tab.md`). This is a
  decision-spike + ADR phase: it de-risks the three architectural unknowns and
  validates the two technical recommendations BEFORE any feature code is written.
  It ships NO production code — only ADRs, throwaway spike scripts (kept under
  `scripts/spikes/`, not imported by the app), and a recorded findings summary.

  Mirrors the established convention of `tasks/backlog--ios-phase0-decision-spikes.md`:
  draft ADRs as `Proposed`, run hands-on spikes, fill the findings, flip to
  `Accepted`, validate. No `DB_VERSION` bump and no schema/object-store code in
  this phase — the data-model ADR only *designs* the migration; Phase 3/4 ship it.

  Decisions already locked with the user (2026-06-29, recorded in the epic
  backlog front-matter): recipes-primary core model; USDA FDC behind a
  first-party Cloudflare Function with IndexedDB caching; on-device targets from a
  local profile (no PII leaves device); section-scoped green theme inside Eat.

  ONE confirmation is required from the user during this phase (Part 1 below):
  whether the eventual `DB_VERSION` bump that adds the Eat object stores is a
  *breaking* migration. The data-model ADR cannot be finalized without it.
---

# Phase 0: "Eat" Tab — Decision Spikes & ADRs (de-risk before building)

## Relevant ADRs

These existing ADRs constrain Phase 0's outputs; each new ADR must reconcile with them explicitly rather than silently widening their scope.

- **ADR-0001** (single-repo Vite) / **ADR-0002** (IndexedDB-only, offline-first) — the "no remote server" framing. The nutrition-source ADR must bound itself against this the way ADR-0019 did, and the data-model ADR must keep all relational data in IndexedDB object stores.
- **ADR-0003** (HuggingFace `Xenova/all-MiniLM-L6-v2`) / **ADR-0011** (layered aisle matching) / **ADR-0013** (web-worker inference) — the embedding model and its loader pattern that the FDC-rerank spike proposes to reuse with **no new download**.
- **ADR-0010** (Cloudflare Pages CI/CD) / **ADR-0019** (first-party stateless fetch proxy for recipe import) — the precedent and security posture (`X-Shoop-*` token, SSRF guards, response/time caps, per-IP rate limit, no secrets/no storage) the new `/api/nutrition` function must mirror and extend, not reinvent.
- **ADR-0017** (decouple semver from `DB_VERSION`) — the eventual store-adding migration must ship as a `feat:`-level commit; CI fails a `DB_VERSION` bump with no `feat:` in range. **Phase 0 does not bump `DB_VERSION`.**
- **ADR-0020** (monochrome-blue identity) + **ADR-0008** (original green, *superseded* by 0020) — the theming ADR must show how a section-scoped green coexists with the in-force blue identity, reusing the `@theme` CSS-custom-property *mechanism* (which survived 0008→0020) rather than forking it. Note 0008 being already-green is precedent, not a palette to restore.
- **ADR-0021** (recipe ingredient normalization) — records that `normalizeIngredient` deliberately **discards** the quantity. The quantity→grams spike confirms the data-model ADR's plan to *extend* parsing to extract value+unit (a new path, not a change to the ADR-0021 noun-phrase behavior).

## Goal

Ratify the three "Eat" architectural decisions as ADRs and validate (or kill) the two technical recommendations via hands-on spikes, so Phase 1 can start the shell/theme work and Phases 3–5 can build persistence, enrichment, and scoring against settled decisions instead of open questions.

## Exit Criteria

- **Three ADRs drafted, findings recorded, status `Accepted`:**
  1. Eat data model (new object stores + the eventual `DB_VERSION` migration design; breaking-ness confirmed with user).
  2. Nutrition data source (`/api/nutrition` Cloudflare Function + IndexedDB cache + offline degradation), bounded against the "no remote server" framing.
  3. Section-scoped green theming (parallel green ramp activated by `data-theme="eat"` on the shell root, keyed off the active route).
- **Spike 1 (FDC match quality) recorded:** for ~30 real imported ingredients, the hit-rate of plain FDC text search vs embedding-reranked search, with a go/no-go verdict on the HF-rerank recommendation and a fallback decision if it's killed.
- **Spike 2 (quantity→grams) recorded:** which units in the `normalizeIngredient` `UNITS` vocabulary are convertible to grams (via FDC portion data + a small density/weight table) and which need a manual-gram fallback.
- **Open questions** from the epic backlog triaged: each either resolved in an ADR or explicitly deferred to a named later phase.
- `npm run validate` clean (no production code changed; spikes live outside `src/`). No `DB_VERSION` change. `e2e_required: false` for this phase.

---

## Execution status (2026-06-30)

- **Part 1 — done.** Data layer + `normalizeIngredient` re-read; user confirmed
  the future store-adding migration is **non-breaking / additive** (recorded in
  ADR-0026).
- **Part 2/3/4 — done.** ADR-0026 (data model), ADR-0027 (nutrition source),
  ADR-0028 (section-scoped theme) drafted and set **Accepted**.
- **Part 5 — Spike 1 (FDC match quality): harness built, live run blocked here.**
  `scripts/spikes/eat-fdc/fdc-match.mjs` runs end-to-end, but this session's
  egress policy denies `api.nal.usda.gov` (proxy `connect_rejected`; not routed
  around, per the proxy README). One command from numbers wherever FDC is
  reachable. Does **not** block the ADRs — rerank is a Phase 4 tuning detail with
  a manual-pick fallback. See `scripts/spikes/eat-fdc/FINDINGS.md`.
- **Part 6 — Spike 2 (quantity→grams): done.** Ran `unit-coverage.mjs`: of 87
  unit tokens, ~15% mass (auto), ~41% volume (need density), ~44% count (need
  per-piece grams). Confirms the `grams?` manual fallback. Findings recorded.
- **Part 7 — done** except the Spike-1 numeric fill (pending a FDC-reachable
  run). Open questions triaged into the ADRs / deferred to named phases.

## Implementation Steps

### Part 1 — Research & the one required confirmation

- [ ] Re-skim the constraining ADRs listed above (0019 security posture and 0017 migration rule are the load-bearing ones).
- [ ] Re-read the current data layer to ground the data-model ADR in what exists: `src/db/schema.ts` (interfaces + `ShoopDB`), `src/db/idbClient.ts` (append-only `if (oldVersion < N)` `upgrade()` cases; current `DB_VERSION = 8`), and how `items` / `list_items` relate, so the new stores reference existing keys correctly.
- [ ] Re-read `src/utils/normalizeIngredient.ts` — confirm the `UNITS` set and `NUMBER_SRC`/`LEADING_QUANTITY` regexes are the surface the quantity→grams spike measures against, and that extraction is additive (Phase 3 work), not a rewrite of the noun-phrase path.
- [ ] **Confirm with the user (AskUserQuestion):** is the migration that adds the Eat object stores (`recipes`, `recipe_ingredients`, `meal_plan_entries`, `nutrition_cache`) a *breaking* change? Per AGENTS.md a `DB_VERSION` bump must be `feat:`-level and breaking-ness must be confirmed before committing the migration. The answer is recorded in the data-model ADR's Notes; **the migration itself ships later (Phase 3/4), not in Phase 0.**

### Part 2 — ADR A: Eat data model

> ⚠️ Provisional ADR numbers below. ADR-0025 is reserved by the iOS Capacitor Phase 0 (`backlog--ios-phase0-decision-spikes.md`). Assign the next free numbers at creation time; if the iOS ADR hasn't landed, coordinate so the two epics don't collide on 0025.

- [ ] Create `docs/adrs/0026-eat-data-model.md` from `_template.md`.
- [ ] **The Problem:** persisted recipes rolled into a weekly plan need new relational stores; today imported ingredients are dumped into a list and not persisted as a reusable unit.
- [ ] **The Solution:** four new IndexedDB object stores keyed by `crypto.randomUUID()` strings, added via one append-only `if (oldVersion < 9)` migration case.
- [ ] **Options Considered:** (a) extend existing `items`/`list_items` with nutrition fields — rejected (conflates shopping-list rows with recipe authorship and weekly planning); (b) **dedicated Eat stores referencing `items.id` for catalog reuse** — selected; (c) a single denormalized `recipes` blob store — rejected (no per-ingredient query for enrichment/rollup).
- [ ] **Draft the store shapes** (interfaces to add to `schema.ts` *in a later phase*, designed here):
  - `recipes` — `id` PK, `title`, `source_url?`, `servings`, `created_at`.
  - `recipe_ingredients` — `id` PK, `recipe_id` (Index), `raw`, `canonical_name`, `item_id?` (reuse the catalog), **`quantity` + `unit`** (the value `normalizeIngredient` currently discards — extraction lands in Phase 3), and a `grams?` resolved by the enrichment pipeline.
  - `meal_plan_entries` — `id` PK, `recipe_id` (Index), `day`/`date`, `planned_servings`.
  - `nutrition_cache` — keyed by FDC id; stores the per-food nutrient payload + the ingredient-query→FDC-id mapping, so a re-opened planned recipe is offline.
- [ ] **Notes:** the breaking-ness answer from Part 1; that `DB_VERSION` goes 8→9 in Phase 3/4 (not now) as a `feat:` commit per ADR-0017; the relationship to `items`/`item_locations`; that IDs follow the `crypto.randomUUID()` convention.
- [ ] Status `Proposed` (flip to `Accepted` in Part 7).

### Part 3 — ADR B: Nutrition data source

- [ ] Create `docs/adrs/0027-eat-nutrition-data-source.md` from `_template.md`.
- [ ] **The Problem:** nutrition data requires USDA FoodData Central (an API key + a network call), which conflicts with the offline-first rule.
- [ ] **The Solution:** a second first-party stateless Cloudflare Pages Function (`/api/nutrition`) holding the FDC key server-side, with every food's nutrient data cached in IndexedDB (`nutrition_cache`).
- [ ] **Options Considered:** **first-party `/api/nutrition` function mirroring ADR-0019** (selected); third-party nutrition API direct from client (rejected — leaks key + no offline cache control); bundling a static nutrition dataset (rejected — size, staleness, no coverage for arbitrary imported ingredients).
- [ ] **Rationale & security posture (mirror ADR-0019):** scheme/host allowlist (FDC host only — tighter than 0019's open proxy), `X-Shoop-Nutrition` shared token from a build-time `VITE_*` env, response-size + timeout caps, per-IP rate-limit rule, free-plan quota hard-stop as the worst-case ceiling. Key lives only in the Pages env var; the function stores nothing and holds no user data. Parser/normalizer in a pure `functions/_lib/*` module (testable without mocking `fetch`), matching the `parseRecipeJsonLd.ts` precedent.
- [ ] **Offline degradation:** a fresh, never-seen ingredient has no cached nutrition offline → surface an explicit "needs connection to enrich" state; the offline shopping/check-off critical path (ADR-0001) is untouched.
- [ ] **Notes:** explicitly bound against CLAUDE.md "no remote server" framing — this is the *second* server-side surface, justified here per ADR-0019's "future functions must each justify themselves" clause; pre-warm strategy (enrich-on-save vs lazy) left as a Phase 4 open question.
- [ ] Status `Proposed`.

### Part 4 — ADR C: Section-scoped green theming

- [ ] Create `docs/adrs/0028-eat-section-scoped-theme.md` from `_template.md`.
- [ ] **The Problem:** Eat wants a green identity while the rest of the app keeps ADR-0020's in-force blue, without a global toggle.
- [ ] **The Solution:** a parallel green token ramp scoped by a `data-theme="eat"` attribute set on the app-shell root, keyed off the active route; chrome (nav + `StoreHeader`) retheme because they live outside the route `<Outlet>` but inside the shell root.
- [ ] **Options Considered:** **`data-theme` attribute + scoped CSS-custom-property overrides on the shell root** (selected — reuses the ADR-0020/0008 `@theme` mechanism, zero JS palette swapping); a second React context/provider toggling inline styles (rejected — fights the token system); per-route `<div>` wrapper themes (rejected — misses the nav/header chrome outside the `Outlet`).
- [ ] **Rationale:** the `@theme` custom-property mechanism survived the 0008→0020 identity change precisely so palettes can be swapped without touching components; a `[data-theme="eat"]` block redefining `--color-primary`/`--color-accent`/`--color-tint`/`--shadow-*` (green ramp) inherits to everything under the shell root. Reverts to blue automatically on leaving `/eat` because the attribute is driven by the route.
- [ ] **Notes:** WCAG AA contrast must be re-checked on the green ramp (deferred to Phase 1 implementation/Phase 6 a11y pass — this ADR only fixes the *mechanism*, not the final hex values); reduced-motion already a project convention; the green is **section-scoped, not a global theme switch**.
- [ ] Status `Proposed`.

### Part 5 — Spike 1: FDC match quality (validates the HF-rerank recommendation)

> Throwaway code. Lives in `scripts/spikes/fdc-match/` (or a scratch dir), never imported by `src/`. Needs a free USDA FDC API key in a local `.env.local` (never committed; only `.env.example` gets an empty `FDC_API_KEY=`). The point is a go/no-go number, not shippable code.

- [ ] Assemble a fixture of ~30 real ingredient strings from actual imported recipes, run through `normalizeIngredient` to get the canonical noun phrase (the same input the eventual pipeline sees).
- [ ] For each: query FDC text search; record (a) does the **top plain-search hit** match the intended food, and (b) does **embedding-reranking** the top-N candidates (cosine similarity against the noun phrase, reusing the `all-MiniLM-L6-v2` model per ADR-0003) pick a better food. A node-side embedding via `@huggingface/transformers` is fine for the spike; production reuses the in-app loader.
- [ ] Tabulate plain-hit-rate vs reranked-hit-rate over the 30.
- [ ] **Verdict:** if rerank meaningfully beats plain search → confirm the recommendation (feeds Phase 4). If it doesn't → kill it and record the fallback (e.g. plain top-hit + always-available manual-pick). Either way a manual-pick fallback for low confidence is assumed.
- [ ] Write findings into ADR-0027's Notes (and/or a `Spike findings` sub-section).

### Part 6 — Spike 2: quantity → grams feasibility

> Pure / offline analysis; no key needed beyond reusing Spike 1's FDC responses for portion data.

- [ ] Enumerate the `UNITS` set in `normalizeIngredient.ts` and bucket each: (1) **mass** (g, kg, oz, lb) — trivially convertible; (2) **volume** (cup, tbsp, tsp, ml, l, qt, pt, gal, fl oz) — convertible *only with an ingredient density*; (3) **count/container** (clove, can, slice, bunch, head, package, stick…) — convertible only via FDC `foodPortions` gram weights or a manual table.
- [ ] For a handful of common ingredients, check whether FDC `foodPortions` supplies a usable gram weight for the count/container units; assemble a minimal density/weight table for the volume/count gaps.
- [ ] **Output:** a coverage map — which units are auto-convertible, which need the manual-gram fallback — that scopes the Phase 4 conversion work and confirms the data-model ADR's `grams?` field is the right escape hatch.
- [ ] Record findings (ADR-0026 or ADR-0027 Notes, whichever the conversion logic attaches to — likely 0027 as part of enrichment).

### Part 7 — Triage open questions, finalize ADRs, validate

- [ ] Walk the epic backlog's "Open questions" and resolve-or-defer each: per-serving vs whole-recipe nutrition (where servings is set); pre-warm aggressiveness (enrich on save vs lazy); fixed Mon–Sun grid vs rolling 7 days; DRI micro coverage (full panel vs curated few for v1). Record each decision in the relevant ADR or mark it explicitly deferred to its phase.
- [ ] Fill every TBD/spike-findings placeholder in all three ADRs.
- [ ] Flip ADR-0026, 0027, 0028 status `Proposed` → `Accepted`.
- [ ] Update `PLAN.md`: move the Eat epic line into "Current Status" as Phase 0 (active), referencing this file.
- [ ] `npm run validate` — expected clean (no `src/` change). Confirm no `DB_VERSION` change in the diff.
- [ ] Commit (Conventional Commits: `docs:` for the ADRs/plan — **not** `feat:`, since no schema or product code changes) and push to `claude/eat-tab-phase-0-plan-7hdmws`.

---

## What Phase 0 explicitly does NOT do

- No new object stores, no `DB_VERSION` bump, no `idbClient.ts`/`schema.ts` change (that's Phase 3/4).
- No `/api/nutrition` function implementation (designed only; built in Phase 4).
- No Eat tab, route, or theme code (Phase 1).
- No `package.json` change without asking — the spike's `@huggingface/transformers` is already a dependency (ADR-0003); if a spike needs a new dev dep, confirm with the user first per AGENTS.md.

## Smoke Test (manual gate — no Playwright this phase)

- Three ADRs committed and `Accepted`.
- Spike 1 documented: plain vs reranked FDC hit-rate over ~30 ingredients + go/no-go verdict.
- Spike 2 documented: unit→grams coverage map (auto-convertible vs manual fallback).
- DB-migration breaking-ness confirmed with the user and recorded in ADR-0026.
- `npm run validate` clean; no `DB_VERSION` change.
