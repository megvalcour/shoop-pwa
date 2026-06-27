---
status: active
class: lightweight
e2e_required: false
---

# Recipe Import — Strip Slash-Delimited Dual Measurements

## Problem

Ingredients that carry **two measurements separated by a slash** (a US + metric
dual amount, common on recipe sites that publish both) import with the *alternate*
measurement stranded inside the item name.

Observed (current behavior of `normalizeIngredient`):

| Raw ingredient | Current name (bug) | Expected name |
| --- | --- | --- |
| `1 cup / 180 grams flour` | `/ 180 Grams flour` | `Flour` |
| `2 cups / 240 g all-purpose flour` | `/ 240 G all-purpose flour` | `All-purpose flour` |
| `180 grams / 1 cup flour` | `/ 1 Cup flour` | `Flour` |
| `1 stick / 113 g butter` | `/ 113 G butter` | `Butter` |

The user-reported "imported as *Cups / 180 grams flour* instead of *Flour*" is
this case — the slash-delimited second measure survives into the name, and its
first letter is then mis-sentence-cased.

## Root cause

`src/utils/normalizeIngredient.ts` strips only the **first** leading
quantity+unit. The leading-measurement grammar it actually handles is:

```
[number] [unit]? [of]? <noun>
```

But dual-measure ingredients are:

```
[number] [unit]?  /  [number] [unit]?  [of]?  <noun>
```

After the first `quantity`+`unit` are stripped, the remainder begins with the
slash clause (e.g. `"/ 180 grams flour"`). Nothing consumes it, so it becomes the
name. The parenthetical dual form (`1 cup (180 g) flour`) already works because
parentheticals are stripped up front — only the **slash** form is broken.

## Fix

Add one conservative step to `normalizeIngredient`, immediately **after** the
existing leading quantity → size → unit strip and **before** the `of` connective
drop / noun extraction:

> If the remainder begins with a `/` separator, treat what follows as an
> **alternate measurement** and strip it: drop the slash, then reuse the existing
> `stripLeadingQuantity` and `stripLeadingUnit` helpers to consume the alternate
> `number [unit]`. Loop while the remainder still begins with `/` (tolerates more
> than two measures), but never strip down to an empty name (reuse the existing
> "noun phrase must remain" guard so a degenerate measures-only line falls back).

This keeps the **first** measurement as the saved `quantity`/`unit` (predictable;
for grocery purposes the choice between the volume and weight figure is
immaterial) and reuses existing parsing logic rather than adding a parallel path.

### Why a leading-`/` trigger is safe

A legitimate cleaned ingredient name never begins with `/`. Anchoring the strip to
"remainder starts with a slash separator" means we only act on the stranded
alternate-measure case and cannot corrupt normal names. Crucially we do **not**
normalize slashes globally — doing so would shatter ascii fractions
(`1/2 cup` → `1 / 2 cup`). The trigger is the post-strip leading slash only.

### Scope notes / out of scope

- **Spaced slash only** (`cup / 180 g`), which is what JSON-LD `recipeIngredient`
  strings emit. The glued form (`1 cup/180g flour`) is rarer and is **not**
  handled here, to avoid the fraction-shattering risk above. Note it as a known
  follow-up if it shows up in real imports.
- Which of the two measures to keep is a deliberate "keep the first" choice; flag
  in review if volume-preferred is wanted later.

## Files

- `src/utils/normalizeIngredient.ts` — add the alternate-measure strip helper +
  wire it into `normalizeIngredient`. Pure function; no DB, schema, or ADR impact.
- `src/utils/__tests__/normalizeIngredient.test.ts` — add cases:
  - `1 cup / 180 grams flour` → `Flour`, qty `1`, unit `cup`
  - `2 cups / 240 g all-purpose flour` → `All-purpose flour`, qty `2`, unit `cups`
  - `180 grams / 1 cup flour` (metric-first) → `Flour`, qty `180`, unit `grams`
  - `1 stick / 113 g butter` → `Butter`
  - regression guard: `1/2 cup sugar` still → `Sugar`, qty `0.5`, unit `cup`
    (ascii fraction not mistaken for a dual measure)
  - regression guard: a normal name containing no slash is untouched.

## Validation

- `npm run validate` (typecheck + lint + Vitest). The existing
  `normalizeIngredient` suite plus the new cases must pass.
- No `DB_VERSION` bump → `fix:` commit is correct (no migration, no breaking
  change).

## Commit

`fix: strip slash-delimited alternate measurements in recipe import`
