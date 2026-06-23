import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { buildCandidates, type Candidate } from '@/services/classifier';

// The candidate set is now supplied by the caller (ADR-0015): the active store's
// item→aisle map plus that store's aliases. Two items in numeric aisles, one in
// a NON-numeric department, plus a concrete-noun alias pointing at Produce.
const aisleById = new Map([
  ['aisle-21', '21'],
  ['aisle-1', '1'],
  ['aisle-produce', 'Produce Dept'],
]);
const CANDIDATES: Candidate[] = buildCandidates(
  [
    { canonical_name: 'bread', aisle_id: 'aisle-21' },
    { canonical_name: 'butter', aisle_id: 'aisle-1' },
    { canonical_name: 'bananas', aisle_id: 'aisle-produce' },
  ],
  { 'Produce Dept': ['banana'] },
  aisleById,
);

const STORE = 'store-1';

// Semantic results the mocked worker returns, keyed by query phrase. Anything not
// listed resolves to '' (below threshold / no confident match).
const SEMANTIC_RESULTS: Record<string, string> = {
  plantains: 'Produce Dept',
  'hot dog rolls': '21',
  xyz: '',
};

// Manual Worker mock: posts `ready` after `load`, and a correlated `result` after
// `classify`. Records every instance and every posted message for assertions.
// `loadMode` controls the reply to a `load` so failure paths can be exercised:
//   'ready'  → posts { type: 'ready' } (default)
//   'error'  → posts { type: 'error' }
//   'onerror'→ fires the worker's onerror handler
//   'silent' → posts nothing (exercises the readiness timeout)
let loadMode: 'ready' | 'error' | 'onerror' | 'silent' = 'ready';
const workerInstances: MockWorker[] = [];
const postedMessages: unknown[] = [];

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor() {
    workerInstances.push(this);
  }

  postMessage(message: { type: string; id?: string; phrase?: string }) {
    postedMessages.push(message);
    if (message.type === 'load') {
      if (loadMode === 'ready') {
        queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } } as MessageEvent));
      } else if (loadMode === 'error') {
        queueMicrotask(() => this.onmessage?.({ data: { type: 'error' } } as MessageEvent));
      } else if (loadMode === 'onerror') {
        queueMicrotask(() => this.onerror?.({}));
      }
      // 'silent' → no reply.
    } else if (message.type === 'classify') {
      const aisleNumber = SEMANTIC_RESULTS[message.phrase ?? ''] ?? '';
      queueMicrotask(() =>
        this.onmessage?.({
          data: { type: 'result', id: message.id, aisleNumber },
        } as MessageEvent),
      );
    }
  }

  terminate() {}
}

beforeEach(() => {
  loadMode = 'ready';
  workerInstances.length = 0;
  postedMessages.length = 0;
  vi.stubGlobal('Worker', MockWorker);
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
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
  it('isReady stays false until primed, then becomes true after the worker loads', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    expect(result.current.isReady).toBe(false);

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it('does not boot the worker until prime() is called', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    expect(workerInstances).toHaveLength(0);
  });

  it('boots the worker exactly once across repeated primes', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    act(() => result.current.prime());

    expect(workerInstances).toHaveLength(1);
  });

  it('classify returns empty string for empty/whitespace input without booting the worker', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    expect(await result.current.classify('', [AISLE_21, AISLE_1])).toBe('');
    expect(await result.current.classify('   ', [AISLE_21, AISLE_1])).toBe('');
    expect(workerInstances).toHaveLength(0);
  });

  it('classify resolves a non-numeric department via the lexical alias fast-path (no worker)', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    const aisleId = await result.current.classify('banana', [AISLE_PRODUCE]);
    expect(aisleId).toBe('aisle-produce');
    expect(workerInstances).toHaveLength(0);
  });

  it('classify resolves a lexical exact-phrase match without posting to the worker', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('bread', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('aisle-21');
    expect(postedMessages.some((m) => (m as { type: string }).type === 'classify')).toBe(false);
  });

  it('classify resolves a semantic query via the worker reply', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('plantains', [AISLE_PRODUCE]);
    expect(aisleId).toBe('aisle-produce');
    expect(postedMessages.some((m) => (m as { type: string }).type === 'classify')).toBe(true);
  });

  it('classify returns empty string when the worker reports no confident match', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const aisleId = await result.current.classify('xyz', [AISLE_21, AISLE_1]);
    expect(aisleId).toBe('');
  });

  it('classify returns empty string for a semantic query before the worker is ready', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    // No prime() — worker never ready, so the semantic fallback short-circuits.
    const aisleId = await result.current.classify('plantains', [AISLE_PRODUCE]);
    expect(aisleId).toBe('');
    expect(workerInstances).toHaveLength(0);
  });

  it('classify returns empty string when the matched aisle has no entry in the aisles array', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    // "bread" hits the lexical exact-phrase path → aisle "21", but the caller
    // passes an empty aisles array, so it cannot be resolved to an id.
    const aisleId = await result.current.classify('bread', []);
    expect(aisleId).toBe('');
  });

  it('re-embeds when the active store changes (a new load is posted)', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result, rerender } = renderHook(
      ({ store }: { store: string }) => useAisleMatcher(store, CANDIDATES),
      { initialProps: { store: 'store-1' } },
    );

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const loadsBefore = postedMessages.filter((m) => (m as { type: string }).type === 'load').length;

    // Switch the active store: isReady drops until the worker re-embeds.
    rerender({ store: 'store-2' });
    act(() => result.current.prime());
    await waitFor(() => expect(result.current.isReady).toBe(true));

    const loadsAfter = postedMessages.filter((m) => (m as { type: string }).type === 'load').length;
    expect(loadsAfter).toBe(loadsBefore + 1);
    expect(workerInstances).toHaveLength(1);
  });

  it('status becomes "ready" after the worker loads; isReady is true', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    expect(result.current.status).toBe('idle');

    act(() => result.current.prime());
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isReady).toBe(true);
  });

  it('status becomes "failed" when the worker posts an error; isReady stays false', async () => {
    loadMode = 'error';
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.isReady).toBe(false);
  });

  it('status becomes "failed" when the worker.onerror fires', async () => {
    loadMode = 'onerror';
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });

  it('status becomes "failed" when the readiness timeout elapses with no ready', async () => {
    loadMode = 'silent';
    vi.useFakeTimers();
    try {
      const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
      const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

      act(() => result.current.prime());
      expect(result.current.status).toBe('loading');

      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(result.current.status).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a prime() after a failure retries — re-enters "loading" then "ready"', async () => {
    loadMode = 'error';
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result } = renderHook(() => useAisleMatcher(STORE, CANDIDATES));

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.status).toBe('failed'));

    // The next load succeeds: priming the same store retries from loading.
    loadMode = 'ready';
    act(() => result.current.prime());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('a store switch re-enters "loading"', async () => {
    const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
    const { result, rerender } = renderHook(
      ({ store }: { store: string }) => useAisleMatcher(store, CANDIDATES),
      { initialProps: { store: 'store-1' } },
    );

    act(() => result.current.prime());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ store: 'store-2' });
    act(() => result.current.prime());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});
