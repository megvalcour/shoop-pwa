import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Minimal catalog: two items in numeric aisles, one in a NON-numeric department.
// The Produce item must now be matchable (the old /^\d+$/ filter is gone).
vi.mock('@/assets/aisles/oxford-62.json', () => ({
  default: {
    store: { id: 'store-1', name: 'Test Store', address: '', slug: 'test' },
    aisles: [
      { id: 'aisle-21', store_id: 'store-1', number: '21', label: 'Bread & Bakery', sort_order: 21 },
      { id: 'aisle-1', store_id: 'store-1', number: '1', label: 'Dairy & Eggs', sort_order: 1 },
      {
        id: 'aisle-produce',
        store_id: 'store-1',
        number: 'Produce Dept',
        label: 'Produce',
        sort_order: 0,
      },
    ],
    items: [
      { canonical_name: 'bread', aisle_id: 'aisle-21' },
      { canonical_name: 'butter', aisle_id: 'aisle-1' },
      { canonical_name: 'bananas', aisle_id: 'aisle-produce' },
    ],
  },
}));

// A small matcher-only alias map pointing a concrete noun at the Produce dept.
vi.mock('@/assets/aisles/oxford-62-aliases.json', () => ({
  default: { 'Produce Dept': ['banana'] },
}));

// Embeddings are keyed by input text (not call order) so adding catalog/alias
// candidates can't desynchronise the fixtures. Unlisted text embeds to a zero
// vector (dot product 0 against everything → below threshold).
const VECTORS: Record<string, number[]> = {
  bread: [1, 0, 0],
  butter: [0, 1, 0],
  bananas: [0, 0, 1],
  banana: [0, 0, 1],
  plantains: [0, 0, 1],
  'hot dog rolls': [0.99, 0.01, 0],
};

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockImplementation((text: string) =>
      Promise.resolve({ tolist: () => [VECTORS[text] ?? [0, 0, 0]] }),
    ),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const AISLE_21: import('@/db/schema').Aisle = {
  id: 'aisle-21',
  store_id: 'store-1',
  number: '21',
  label: 'Bread & Bakery',
  sort_order: 21,
};

const AISLE_1: import('@/db/schema').Aisle = {
  id: 'aisle-1',
  store_id: 'store-1',
  number: '1',
  label: 'Dairy & Eggs',
  sort_order: 1,
};

const AISLE_PRODUCE: import('@/db/schema').Aisle = {
  id: 'aisle-produce',
  store_id: 'store-1',
  number: 'Produce Dept',
  label: 'Produce',
  sort_order: 0,
};

describe('useAisleMatcher', () => {
  it('isReady stays false until primed, then becomes true after model loads', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());

    expect(result.current.isReady).toBe(false);

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('does not load the pipeline until prime() is called', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    renderHook(() => useAisleMatcher());

    expect(pipeline).not.toHaveBeenCalled();
  });

  it('classify returns empty string for empty/whitespace input without loading', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());

    expect(await result.current.classify('', [AISLE_21, AISLE_1])).toBe('');
    expect(await result.current.classify('   ', [AISLE_21, AISLE_1])).toBe('');
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('classify resolves a non-numeric department via the lexical alias fast-path', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());

    // No prime() needed — the lexical path is pure and offline.
    const aisleId = await result.current.classify('banana', [AISLE_PRODUCE]);
    expect(aisleId).toBe('aisle-produce');
    expect(pipeline).not.toHaveBeenCalled();
  });

  it('classify matches a Produce-department item semantically (filter removed)', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    // "plantains" has no alias/catalog phrase, so it falls to the semantic
    // engine, where it embeds onto the (no-longer-filtered) bananas vector.
    const aisleId = await result.current.classify('plantains', [AISLE_PRODUCE]);
    expect(aisleId).toBe('aisle-produce');
  });

  it('classify returns the aisle id for a best catalog match above threshold', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('hot dog rolls', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('aisle-21');
  });

  it('classify returns empty string when best score is below threshold', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('xyz', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('');
  });

  it('classify returns empty string when the matched aisle has no entry in the aisles array', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    // "bread" hits the lexical exact-phrase path → aisle "21", but the caller
    // passes an empty aisles array, so it cannot be resolved to an id.
    const aisleId = await result.current.classify('bread', []);
    expect(aisleId).toBe('');
  });
});
