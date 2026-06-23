# Task: Extract item-classification orchestration out of AddItemForm

## Problem

`AddItemForm` conflates a trivial presentational form with a large amount of
classification orchestration. The visible UI is ~25 lines (an `Input`, an Add
`Button`, a "Classifying…" line); the other ~125 lines of
`src/components/organisms/AddItemForm.tsx` are model priming, candidate building,
two `useEffect`s (one carrying an `eslint-disable react-hooks/exhaustive-deps`),
and upsert-on-success wiring.

Consequences that hit the stated goals:

- **Testability:** `AddItemForm.test.tsx` mocks **5 hooks** (`useAddListItem`,
  `useItems`/`useItemLocations`/`useUpsertItemLocation`, `useAisles`,
  `useActiveStore`, `useAisleMatcher`) and drives delicate async-effect timing
  through the DOM. The interesting logic (when to classify, the auto-path
  no-clobber rule, store-switch re-embedding) cannot be tested without rendering.
- **Readability:** the `exhaustive-deps` disable at `:84` is a signal that the
  effect's real dependencies don't fit the component's render model — the logic
  wants to live in a dedicated hook where its lifecycle is explicit.

### Current state — `src/components/organisms/AddItemForm.tsx`

- `:29-40` `candidates` `useMemo` — pure catalog-join (locations × items × aisle
  aliases) producing the matcher's candidate set (ADR-0011/0015).
- `:42` `useAisleMatcher(activeStore?.id, candidates)` → `{ prime, classify, isReady }`.
- `:45-48` `locatedItemIds` set.
- `:52-56` `primeMatcher()` — deliberate-signal priming (blur/submit).
- `:61-63` effect: re-`prime()` on store change once primed.
- `:71-85` effect: backfill-classify catalog items lacking a location at the
  active store (the `exhaustive-deps` disable).
- `:87-119` `handleSubmit` — add item, then classify-on-success via the auto path.
- `:121-122` `showClassifying` derived flag.

## Relevant ADRs

- **ADR-0005 (atomic design):** organisms *may* hold business logic, so this is
  not a layer violation — but the organism is doing two separable jobs. Extracting
  the orchestration into a custom hook keeps the organism thin and makes the
  logic unit-testable in isolation, which is the spirit of the layering.
- **ADR-0011 (layered aisle matching)** and **ADR-0013 (web-worker aisle
  inference):** the candidate set and `classify`/`prime` lifecycle are defined by
  these ADRs. The extracted hook must preserve: priming only on deliberate user
  signal, re-embedding on store switch, and the **auto path never clobbering a
  manual location** (ADR-0015).

No ADR is contradicted. **No new ADR required** — same behavior, relocated.

## Approach

Introduce `src/hooks/useItemClassification.ts` that encapsulates the matcher
lifecycle and the placement rules, leaving `AddItemForm` as a thin form.

### 1. `src/hooks/useItemClassification.ts` (new)

Proposed surface (refine during implementation):

```ts
export interface UseItemClassification {
  /** Begin model loading on a deliberate user signal (blur/submit), no-op if empty. */
  prime: (rawValue: string) => void;
  /** Classify a single item by name and upsert its location via the auto path. */
  classifyAndPlace: (itemId: string, name: string) => void;
  /** True while the matcher is loading and unlocated catalog items remain. */
  isClassifying: boolean;
}

export function useItemClassification(): UseItemClassification { /* … */ }
```

- Internally owns the hooks AddItemForm currently calls for classification:
  `useItems`, `useItemLocations`, `useUpsertItemLocation`, `useAisles`,
  `useActiveStore`, `useAisleMatcher`, plus the `candidates` memo and the two
  effects (priming-on-store-change, backfill-classify).
- The candidate-building memo (`AddItemForm.tsx:29-40`) is pure — consider
  factoring it further into `src/lib/buildAisleCandidates.ts` (wrapping the
  existing `buildCandidates`/`aliasesForSlug` services) so it gets its own
  zero-mock test. Optional but recommended.
- Preserve the auto-path guarantees exactly: classify only when the item has no
  location at the active store; write with `auto: true`.

### 2. `AddItemForm.tsx` → thin form

```tsx
export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useAddListItem();
  const { prime, classifyAndPlace, isClassifying } = useItemClassification();

  function handleSubmit(e) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    prime(name);
    setValue('');
    inputRef.current?.focus();
    mutate({ listId, name }, {
      onSuccess: ({ newItemId }) => { if (newItemId) classifyAndPlace(newItemId, name); },
    });
  }
  // input + Add button + (isClassifying && "Classifying…")
}
```

- Keep the existing UX guarantees: never disable the input while pending, clear +
  refocus immediately so back-to-back entry isn't gated on the mutation, prime on
  blur as well as submit.

## Files to change

| File | Change |
| --- | --- |
| `src/hooks/useItemClassification.ts` | **New** — owns matcher lifecycle + placement rules. |
| `src/lib/buildAisleCandidates.ts` | **New (optional)** — pure candidate builder for zero-mock test. |
| `src/components/organisms/AddItemForm.tsx` | Slim to form + submit wiring. |
| `src/hooks/__tests__/useItemClassification.test.ts` | **New** hook tests. |
| `src/components/organisms/__tests__/AddItemForm.test.tsx` | Reduce to form-behavior tests. |

## Implementation checklist

- [ ] Create `useItemClassification` and move the orchestration out of `AddItemForm`.
- [ ] (Optional) extract `buildAisleCandidates` pure helper + test.
- [ ] Slim `AddItemForm` to the thin form above; preserve clear/refocus/no-disable UX.
- [ ] Confirm the `exhaustive-deps` disable is gone or justified inside the hook.
- [ ] Hook tests cover the placement rules (see below).
- [ ] Reduce `AddItemForm.test.tsx` to form behavior; classification assertions move to the hook test.
- [ ] `npm run validate` clean.
- [ ] `npm run test:e2e` — add-item + auto-categorize flow green (this touches the
      classification critical path; E2E is required).

## Tests

### Hook (`useItemClassification.test.ts`)

Using `renderHook` + a `QueryClient`; mock only the worker boundary
(`useAisleMatcher`) — the rest can use a real `QueryClient` with seeded caches:

- Does **not** classify an item already located at the active store (no-clobber).
- Classifies a freshly added item lacking a location → upserts with `auto: true`.
- Re-primes / re-embeds on active-store change.
- `isClassifying` reflects "matcher not ready AND unlocated items remain".

### Component (`AddItemForm.test.tsx`)

- Submit via Enter and via Add button clears + refocuses the input.
- Whitespace-only input does not submit.
- Input never disabled while a mutation is pending.
- (Classification assertions removed — covered by the hook test.)

## Out of scope

- Changing the matcher model, candidate-scoring, or alias logic.
- Any UI restyle of the add form.
