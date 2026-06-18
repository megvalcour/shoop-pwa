import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Minimal catalog: two items in numeric aisles, one in a named section.
vi.mock('@/assets/aisles/oxford-62.json', () => ({
  default: {
    store: { id: 'store-1', name: 'Test Store', address: '', slug: 'test' },
    aisles: [
      { id: 'aisle-21', store_id: 'store-1', number: '21', label: 'Bread & Bakery', sort_order: 21 },
      { id: 'aisle-1', store_id: 'store-1', number: '1', label: 'Dairy & Eggs', sort_order: 1 },
      { id: 'aisle-produce', store_id: 'store-1', number: 'Produce Dept', label: 'Produce', sort_order: 0 },
    ],
    items: [
      { canonical_name: 'bread', aisle_id: 'aisle-21' },
      { canonical_name: 'butter', aisle_id: 'aisle-1' },
      { canonical_name: 'bananas', aisle_id: 'aisle-produce' }, // non-numeric aisle, should be filtered
    ],
  },
}));

// Mock embeddings: orthogonal unit vectors so dot product equals 1 only for identical
// vectors and approaches 1 for the "best match" we want to test.
// bread → [1, 0, 0], butter → [0, 1, 0]
// We control classify output by controlling embed output per call.

let embedCallCount = 0;
let embedSequence: number[][] = [];

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockImplementation(() => {
      const vec = embedSequence[embedCallCount] ?? [0, 0, 1];
      embedCallCount++;
      return Promise.resolve({ tolist: () => [vec] });
    }),
  ),
}));

// Reset module-level singletons between tests by re-importing the module.
// vitest isolates modules per test file by default; we reset call counters instead.
beforeEach(() => {
  embedCallCount = 0;
  embedSequence = [];
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

describe('useAisleMatcher', () => {
  it('isReady stays false until primed, then becomes true after model loads', async () => {
    // Catalog embeds: bread=[1,0,0], butter=[0,1,0]
    embedSequence = [[1, 0, 0], [0, 1, 0]];

    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());

    // No model loading happens on mount — isReady remains false.
    expect(result.current.isReady).toBe(false);

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('does not load the pipeline until prime() is called', async () => {
    embedSequence = [[1, 0, 0], [0, 1, 0]];

    const { pipeline } = await import('@huggingface/transformers');
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    renderHook(() => useAisleMatcher());

    expect(pipeline).not.toHaveBeenCalled();
  });

  it('classify returns empty string for empty/whitespace input without loading', async () => {
    embedSequence = [[1, 0, 0], [0, 1, 0]];

    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());

    expect(await result.current.classify('', [AISLE_21, AISLE_1])).toBe('');
    expect(await result.current.classify('   ', [AISLE_21, AISLE_1])).toBe('');
  });

  it('classify returns the aisle id for a best catalog match above threshold', async () => {
    // Catalog embeds: bread=[1,0,0], butter=[0,1,0]
    // Query embed for "hot dog rolls": [0.99, 0.01, 0] — closest to bread (dot=0.99≥0.5)
    embedSequence = [[1, 0, 0], [0, 1, 0], [0.99, 0.01, 0]];

    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('hot dog rolls', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('aisle-21');
  });

  it('classify returns empty string when best dot product is below 0.5', async () => {
    // Catalog embeds: bread=[1,0,0], butter=[0,1,0]
    // Query embed: [0, 0, 1] — dot product 0 against everything
    embedSequence = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('xyz', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('');
  });

  it('classify returns empty string when matched catalog aisle has no entry in the aisles array', async () => {
    // Catalog embeds: bread=[1,0,0], butter=[0,1,0]
    // Query embed: [0.99, 0.01, 0] — matches aisle 21, but we pass empty aisles array
    embedSequence = [[1, 0, 0], [0, 1, 0], [0.99, 0.01, 0]];

    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher());
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('bread', []);
    expect(aisleId).toBe('');
  });
});
