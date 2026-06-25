---
step: 7
substep: 1
status: validating
class: lightweight
e2e_required: false
clarifications: |
  Phase 1 scope: ADR-0019 + share_target manifest only. No UI, no logic.
---

# Recipe Import — Add to Grocery Lists from a Recipe

## Goal

Let the user share a recipe page (or paste a URL) into Shoop and add its
ingredients to a shopping list with a single flow. The PWA registers as a Web
**Share Target**; the shared URL is handed to an import screen that fetches the
page, extracts the schema.org `Recipe` JSON-LD, normalizes the ingredients, and
lets the user pick a destination list.

## Decisions Locked (from kickoff)

1. **Fetch strategy:** first-party **Cloudflare Pages Function** (`/api/import-recipe`)
   fetches the recipe URL and parses JSON-LD server-side. No third-party CORS
   proxy. Recipe URLs and the user's IP never leave our own infrastructure.
2. **Import target:** the import screen lets the user choose per-import — add to
   an existing list, create a new list, or add to the default list — with the
   parsed ingredients shown as a checklist they can prune before committing.

## ADRs Consulted / Required

- **ADR-0002 (IndexedDB for core storage)** — upheld. The function is a
  *stateless fetch/parse proxy*; it stores nothing. All persisted data still
  lives only in IndexedDB.
- **ADR-0001 / Offline constraint (CLAUDE.md "Key Constraints")** — upheld.
  Recipe import is inherently online and is **not** in the critical path of the
  offline shopping/check-off flow. The app remains fully functional offline;
  only the import action requires network, and it degrades gracefully (manual
  paste fallback, clear error states).
- **ADR-0010 → 0018 (Cloudflare Pages CI/CD)** — the deploy target already
  supports Pages Functions; the `/functions` directory is picked up
  automatically. CI/build config changes are minimal.
- **ADR-0009 (on-demand lists) / ADR-0015 (store-agnostic items)** — imported
  ingredients become store-agnostic `items` + `list_items`, classified per-store
  by the existing aisle matcher. No schema change.
- **NEW ADR-0019 (proposed): "First-party serverless fetch proxy for recipe
  import."** This introduces a server-side execution surface for the first time,
  which brushes against the project's "no remote server / no backend" framing in
  CLAUDE.md. Per the ADR discipline, this must be recorded explicitly rather than
  silently deviating. The ADR will scope the boundary precisely: the function is
  stateless, holds no user data, performs no persistence, and exists solely to
  work around browser CORS for read-only HTML fetches. **Write this ADR as Step 0
  of implementation.**

## No DB schema change

`DB_VERSION` stays at 5. Imported ingredients flow through the existing
`items` / `list_items` / `default_list` stores via existing hooks. No migration.

---

## Architecture

```
Recipe app/browser
   │  (user taps Share → Shoop)
   ▼
manifest share_target (GET)  ──►  /import?title=&text=&url=
   │
   ▼
ImportRecipeRoute  ──►  RecipeImporter (organism)
   │                        │
   │  useRecipeImport()     │  useShoppingLists / useCreateShoppingList
   │                        │  useAddListItem / useDefaultList
   ▼                        ▼
GET /api/import-recipe?url=…           IndexedDB (via existing hooks)
   │  (Cloudflare Pages Function)
   ▼
fetch(recipe URL) → parse JSON-LD → normalize → JSON { title, ingredients[] }
```

### Why a route, not the share handler doing the work directly

Share Target Level 1 delivers data as a normal GET navigation. The browser opens
`/import?...`; the route is a normal screen. This keeps everything inside the
existing React Router tree (ADR-0006) — no special service-worker POST handling
needed for v1.

---

## Step 0 — ADR-0019 (write first)

`docs/adrs/0019-serverless-fetch-proxy-for-recipe-import.md`

- Status: Accepted
- Problem: browsers can't fetch arbitrary recipe pages (no CORS); the project
  has no backend by design.
- Decision: a single stateless Cloudflare Pages Function used only for read-only
  HTML fetch + JSON-LD extraction during recipe import.
- Options considered: third-party CORS proxy (rejected: privacy + reliability),
  manual-paste-only (kept as fallback, not primary), first-party function
  (selected).
- Notes: explicitly does not weaken the IndexedDB-only data model; no secrets,
  no storage; bounded by a domain/size/time budget and protected by the
  "cheap defense-in-depth" measures in Step 2 (SSRF guards + shared token +
  Cloudflare rate-limit rule). Record the threat model and why those three
  suffice for a single-user app on the free plan.

### Security posture (decided)

Cloudflare's **free plan hard-stops at its daily request quota and does not
bill overages** — the abuse worst-case is "import is unavailable until the
00:00 UTC reset," not a surprise bill. Given that, the chosen posture is
**cheap defense-in-depth**, not heavyweight auth:

1. **SSRF / open-proxy guards** in the function (scheme allowlist, private-IP
   blocking, redirect/size/time caps) — Step 2.
2. **Shared token** the app sends with every call — Step 2 / Step 3. Filters out
   internet scanners that probe the path. Not a true secret (it ships in client
   JS), but raises the bar enormously for ~zero effort.
3. **Cloudflare rate-limit rule** (dashboard, free tier) on
   `/api/import-recipe` per-IP — caps any single abuser well under the daily
   quota. No code; configured in the Pages/Zone dashboard.

The function stays stateless with no secrets and no DB access, so even a full
compromise leaks nothing — blast radius is "free proxy + daily quota."

## Step 1 — Manifest: register as Share Target

File: `vite.config.ts` (`VitePWA.manifest`).

- Add `share_target`:
  ```jsonc
  share_target: {
    action: '/import',
    method: 'GET',
    enctype: 'application/x-www-form-urlencoded',
    params: { title: 'title', text: 'text', url: 'url' },
  }
  ```
- Note: many Android share intents put the link in `text`, not `url`. The route
  must check `url` first, then scan `text` for the first `https?://` token.
- Verify the generated `manifest.webmanifest` includes `share_target` after build.

## Step 2 — Cloudflare Pages Function (server-side fetch + parse)

New dir `functions/` (Pages Functions, file-based routing).

File: `functions/api/import-recipe.ts` → route `/api/import-recipe`.

Responsibilities:
1. Read `?url=` query param. Validate it is a well-formed `http(s)` URL. Reject
   anything else (no SSRF to internal hosts: block private/loopback/link-local
   ranges and non-http schemes).
2. **Shared-token check (cheap defense-in-depth #2):** require a token header
   (e.g. `X-Shoop-Import`) matching an env var bound to the Pages project
   (`IMPORT_TOKEN`, set in the Cloudflare dashboard, **not** committed). Reject
   with `401` when absent/wrong. The client sends it from a build-time env value
   (Step 3). This is not a real secret (it ships in the bundle) — its only job is
   to drop drive-by scanners that hit the bare path.
3. `fetch(url)` with a browser-like `User-Agent`, a hard timeout (~8s via
   `AbortController`), a response **size cap** (e.g. abort past ~2 MB), and
   `redirect: 'follow'` with a small cap.
4. Extract every `<script type="application/ld+json">` block, `JSON.parse` each
   (tolerate trailing data / arrays / `@graph`), and locate the node whose
   `@type` is `Recipe` (string or array containing `"Recipe"`).
5. Pull `recipeIngredient` (preferred) or legacy `ingredients`; coerce to a
   string array. Also capture `name` for the default list/new-list title.
6. Respond `200 application/json`: `{ title, ingredients: string[], sourceUrl }`.
   On no-recipe-found respond `422` with a typed error code; on fetch failure
   `502`; on bad input `400`. Always set permissive same-origin CORS (it's
   same-origin in prod, but allow localhost dev origin).

Keep parsing logic in a **separate pure module** so it is unit-testable without
network: `functions/_lib/parseRecipeJsonLd.ts` (pure `(html: string) =>
ParsedRecipe`). The handler is a thin wrapper (fetch + validate + call pure fn).

> Mirror the parser as a shared pure util if the client also needs it for the
> paste-an-ingredient-list fallback (Step 4); colocate to avoid duplication.

## Step 3 — Client data hook

File: `src/hooks/useRecipeImport.ts` (TanStack Query, per ADR-0004 / data-layer
rule — no inline fetch in components).

- `useRecipeImport(url: string | undefined)` → `useQuery` enabled only when a
  valid URL is present; `queryKey: ['recipe-import', url]`; `queryFn` calls
  `GET /api/import-recipe?url=…`; `staleTime` long (recipes don't change);
  `retry` low. Returns `{ title, ingredients }`, plus typed error surface for the
  422/502/400 cases so the UI can show "Couldn't find a recipe on that page."
  Map `401` to a distinct "import not configured" state (token missing).
- Send the **shared token** (Step 2) on the request, e.g.
  `headers: { 'X-Shoop-Import': import.meta.env.VITE_IMPORT_TOKEN }`. Document
  the var in `.env.example` (empty value, per CLAUDE.md — never commit the real
  one); it must match the `IMPORT_TOKEN` bound to the Pages project.

## Step 4 — Ingredient normalization

File: `src/lib/normalizeIngredient.ts` (pure) + `__tests__`.

Raw `recipeIngredient` strings look like `"2 cups all-purpose flour, sifted"`.
Adding that verbatim classifies poorly in the aisle matcher and reads badly.

- `normalizeIngredient(raw): { name: string; quantity?: number; unit?: string; raw: string }`
  - Strip leading quantity (incl. unicode fractions `½`, ranges `1-2`, `1 to 2`).
  - Strip a leading unit token from a known unit set (cup, tbsp, tsp, oz, lb, g,
    kg, ml, l, clove, can, pinch, …).
  - Strip trailing prep clauses after a comma ("`, sifted`", "`, chopped`").
  - Keep `name` as the cleaned noun phrase; preserve `raw` for display/tooltip.
- This feeds the existing `quantity` field on `list_items` where parseable;
  otherwise quantity defaults to 1 (matching `useAddListItem`).
- Conservative: when unsure, fall back to the raw string as the name. Better a
  slightly-wordy item than a wrong one. Cover edge cases in unit tests.

## Step 5 — Import screen (UI)

Route: add `{ path: 'import', element: <ImportRecipeRoute /> }` to `App.tsx`
(child of `AppShell`).

- `src/routes/ImportRecipeRoute.tsx` — reads `useSearchParams`, derives the URL
  (url param → scan text), renders `<RecipeImporter />` or a manual-paste state
  when no URL was shared.
- `src/components/organisms/RecipeImporter.tsx` (organism — allowed store/hook
  access):
  - Loading / error / empty states for `useRecipeImport`.
  - Parsed ingredients as a checklist (reuse `Checkbox` atom and, where it fits,
    the existing `SelectionList` molecule) — each normalized name shown, raw on
    secondary line; all checked by default; user can uncheck.
  - **Target picker** (new molecule `ImportTargetPicker` or reuse existing
    selection primitives): "New list" (default, named after recipe title) /
    "Existing list" (select from `useShoppingLists`) / "Default list".
  - Commit button → for each checked ingredient, route to the right hook:
    - New list: `useCreateShoppingList()` then `useAddListItem` per ingredient,
      then `navigate('/lists/:id')`.
    - Existing list: `useAddListItem({ listId, name })` per ingredient, navigate
      to that list.
    - Default list: `useDefaultList` add path per ingredient.
  - Adds go through existing hooks → existing aisle-classification fires
    automatically per active store (ADR-0011/0013/0015). No new placement logic.
  - De-dupe is already handled inside `useAddListItem` (canonical-name guard).

Reuse audit (per CLAUDE.md): `Checkbox`, `Button`, `Input`, `SelectionList`,
`ItemEntryForm`/`EditableTitle` where applicable, and the shared modal/bottom-
sheet primitives. Create new atoms/molecules only if none fit.

## Step 6 — Entry points beyond Share Target

Share Target only works once the PWA is installed and only on platforms that
support it (Android Chrome yes; iOS Safari does **not** support Web Share
Target). So also add a **manual entry point** so the feature is usable
everywhere:

- An "Import from recipe" action (e.g. on the lists screen / `NewListFab`
  menu or Settings) that navigates to `/import` with an empty state where the
  user pastes a recipe URL. Same `RecipeImporter` downstream.

This makes iOS and desktop first-class without relying on the share intent.

## Step 7 — Tests

- **Unit (Vitest):**
  - `functions/_lib/parseRecipeJsonLd` — fixtures: `recipeIngredient` array,
    legacy `ingredients`, `@graph` wrapper, `@type` as array, multiple ld+json
    blocks, no-recipe page → typed empty.
  - `normalizeIngredient` — quantities, unicode fractions, ranges, units, prep
    clauses, un-parseable fallback.
  - `useRecipeImport` — success + 422/502 error mapping (mock fetch).
  - `RecipeImporter` — render parsed list, uncheck, pick each target, commit
    calls the right hooks (mock hooks); manual-paste empty state.
  - `ImportRecipeRoute` — url param vs url-in-text extraction.
- **E2E (Playwright):** new `e2e/recipe-import.spec.ts` — navigate to `/import`,
  **mock `/api/import-recipe`** via route interception (don't hit the network),
  assert ingredients render, commit to a new list, land on the list with items.
  (Per CLAUDE.md, `validate` won't catch route/UI regressions — E2E is required
  to call this done.)
- Note in plan: real share-intent dispatch can't be E2E-tested in Playwright;
  cover the route + extraction logic instead.

## Step 7.5 — Cloudflare dashboard setup (out-of-code, do at deploy)

These are manual one-time config steps, not code — note them in
`docs/releases.md` alongside the existing Pages setup:

- Bind `IMPORT_TOKEN` as an environment variable / secret on the Pages project
  (Production + Preview). Set `VITE_IMPORT_TOKEN` in the build env to the same
  value so the client and function agree.
- Add a **rate-limiting rule** (free tier) targeting the
  `/api/import-recipe` path, scoped per client IP (e.g. ≤ ~20 req/min), action
  = block/challenge. This is the per-IP throttle (defense-in-depth #3); it lives
  in the dashboard, not the repo.

## Step 8 — Validate & ship

- `npm run validate` (typecheck + lint + unit).
- `npm run test:e2e`.
- `npm run build` and confirm `share_target` is present in the emitted manifest.
- Commit, push to `claude/recipe-ingredients-grocery-lists-5d1762`.
- On completion: update `PLAN.md` (this is a new backlog item — add then clear),
  rename this file to `tasks/complete--recipe-import.md`.

## Risks / Open Questions

- **Site coverage:** not every recipe site ships clean JSON-LD; some gate on
  bot detection. Mitigation: clear "no recipe found" state + manual paste of
  the ingredient list (parse client-side with the same pure parser, or accept a
  newline-separated paste). Consider a small allow-tested set of popular sites.
- **iOS:** no Web Share Target — manual entry point (Step 6) is the iOS path.
- **SSRF / abuse:** the function fetches arbitrary URLs and is a public endpoint.
  Posture decided = **cheap defense-in-depth** (see "Security posture" under
  Step 0): SSRF guards (Step 2), shared token (Steps 2–3), per-IP rate-limit rule
  (Step 7.5). The free plan hard-stops at its daily quota with **no overage
  billing**, so the abuse ceiling is "import unavailable till 00:00 UTC reset,"
  not a surprise bill. Function is stateless with no secrets/DB → nothing to leak.
- **Cloudflare Function in CI:** confirm the `build-and-deploy` job publishes the
  `/functions` dir (Pages does this automatically) and that `wrangler`/Pages
  config doesn't need a `compatibility_date`. Verify in a preview deploy.
