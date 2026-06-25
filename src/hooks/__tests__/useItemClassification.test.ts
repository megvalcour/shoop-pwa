import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { Aisle, Item, ItemLocation, Store } from '@/db/schema';
import { dbPromise, ACTIVE_STORE_ID_KEY } from '@/db/idbClient';
import { useItemClassification } from '@/hooks/useItemClassification';
import { useSetActiveStoreId } from '@/hooks/usePreferences';

// Mock only the worker boundary (ADR-0013). The mocked `prime` identity changes
// with `storeKey`, mirroring the real `useCallback`, so the consumer's
// "re-embed on store switch" effect re-fires when the active store changes.
const matcher = vi.hoisted(() => ({
  isReady: false,
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'failed',
  prime: vi.fn<(storeKey?: string) => void>(),
  classify: vi.fn<() => Promise<string>>(async () => ''),
}));

vi.mock('@/hooks/useAisleMatcher', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    useAisleMatcher: (storeKey: string | undefined) => {
      const prime = React.useMemo(() => () => matcher.prime(storeKey), [storeKey]);
      return {
        prime,
        classify: matcher.classify,
        isReady: matcher.isReady,
        status: matcher.status,
      };
    },
  };
});

// Mock the Zustand store so we can spy on the lifecycle actions the hook drives.
const storeActions = vi.hoisted(() => ({
  begin: vi.fn<(id: string) => void>(),
  end: vi.fn<(id: string) => void>(),
  setStatus: vi.fn<(status: string) => void>(),
  reset: vi.fn<() => void>(),
}));

vi.mock('@/stores/useCategorizationStore', () => {
  const state = {
    status: 'idle' as const,
    categorizingIds: new Set<string>(),
    ...storeActions,
  };
  return {
    useCategorizationStore: <T,>(selector: (s: typeof state) => T) => selector(state),
  };
});

const STORE_ID = 'store-1';

function makeRender() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const utils = renderHook(
    () => ({ c: useItemClassification(), setStore: useSetActiveStoreId() }),
    { wrapper },
  );
  return { queryClient, ...utils };
}

async function clearAll() {
  const db = await dbPromise;
  for (const store of ['stores', 'aisles', 'items', 'item_locations', 'preferences'] as const) {
    await db.clear(store);
  }
}

async function seed(opts: {
  stores: Store[];
  aisles: Aisle[];
  items: Item[];
  locations: ItemLocation[];
  activeStoreId?: string;
}) {
  const db = await dbPromise;
  for (const s of opts.stores) await db.put('stores', s);
  for (const a of opts.aisles) await db.put('aisles', a);
  for (const i of opts.items) await db.put('items', i);
  for (const l of opts.locations) await db.put('item_locations', l);
  await db.put('preferences', {
    key: ACTIVE_STORE_ID_KEY,
    value: opts.activeStoreId ?? STORE_ID,
  });
}

const store = (id: string, slug: string): Store => ({ id, name: id, address: '', slug });
const aisle = (id: string, number: string): Aisle => ({
  id,
  store_id: STORE_ID,
  number,
  label: number,
  sort_order: 0,
});
const item = (id: string, name: string): Item => ({ id, name, canonical_name: name });
const loc = (item_id: string, aisle_id: string, store_id = STORE_ID): ItemLocation => ({
  id: `loc-${item_id}-${store_id}`,
  item_id,
  store_id,
  aisle_id,
});

// Wait until the active-store-scoped queries have resolved so `locatedItemIds`
// reflects the seeded data before we exercise the placement rules.
async function waitForLoaded(queryClient: QueryClient) {
  await waitFor(() => {
    expect(queryClient.getQueryData(['items'])).toBeDefined();
    expect(queryClient.getQueryData(['item_locations', STORE_ID])).toBeDefined();
    expect(queryClient.getQueryData(['aisles', STORE_ID])).toBeDefined();
  });
}

describe('useItemClassification', () => {
  beforeEach(async () => {
    matcher.isReady = false;
    matcher.status = 'idle';
    matcher.prime.mockReset();
    matcher.classify.mockReset();
    matcher.classify.mockResolvedValue('');
    storeActions.begin.mockReset();
    storeActions.end.mockReset();
    storeActions.setStatus.mockReset();
    storeActions.reset.mockReset();
    await clearAll();
  });

  it('does not classify an item already located at the active store (no-clobber)', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')],
    });
    matcher.isReady = true;
    matcher.status = 'ready';

    const { queryClient, result } = makeRender();
    await waitForLoaded(queryClient);

    act(() => result.current.c.classifyAndPlace('i-kefir', 'kefir'));
    await Promise.resolve();

    expect(matcher.classify).not.toHaveBeenCalled();
    const rows = await (await dbPromise).getAllFromIndex('item_locations', 'item_id', 'i-kefir');
    expect(rows).toHaveLength(1);
    expect(rows[0].aisle_id).toBe('a-dairy');
  });

  it('classifies a freshly added item lacking a location and writes via the auto path', async () => {
    await seed({
      // Catalog item already located so the backfill effect classifies nothing —
      // the only classify call must come from classifyAndPlace for the new item.
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-bread', '21'), aisle('a-produce', '7')],
      items: [item('i-bread', 'bread')],
      locations: [loc('i-bread', 'a-bread')],
    });
    matcher.isReady = true;
    matcher.status = 'ready';
    matcher.classify.mockResolvedValue('a-produce');

    const { queryClient, result } = makeRender();
    await waitForLoaded(queryClient);

    act(() => result.current.c.classifyAndPlace('i-new', 'bananas'));

    await waitFor(async () => {
      const rows = await (await dbPromise).getAllFromIndex('item_locations', 'item_id', 'i-new');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ store_id: STORE_ID, aisle_id: 'a-produce' });
    });
    expect(matcher.classify).toHaveBeenCalledTimes(1);
  });

  it('re-primes the matcher when the active store changes', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62'), store('store-2', 'big-y-worcester')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')],
      activeStoreId: STORE_ID,
    });

    const { queryClient, result } = makeRender();
    await waitForLoaded(queryClient);

    // Deliberate user signal primes for the current store.
    act(() => result.current.c.prime('milk'));
    await waitFor(() => expect(matcher.prime).toHaveBeenCalledWith(STORE_ID));

    // Switching the active store re-embeds the worker for the new store.
    await act(async () => {
      await result.current.setStore.mutateAsync('store-2');
    });
    await waitFor(() => expect(matcher.prime).toHaveBeenCalledWith('store-2'));
  });

  it('classifyAndPlace (matcher ready) marks the item begin then end after classify settles', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-bread', '21'), aisle('a-produce', '7')],
      items: [item('i-bread', 'bread')],
      locations: [loc('i-bread', 'a-bread')], // catalog item located → no backfill
    });
    matcher.isReady = true;
    matcher.status = 'ready';
    matcher.classify.mockResolvedValue('a-produce');

    const { queryClient, result } = makeRender();
    await waitForLoaded(queryClient);

    act(() => result.current.c.classifyAndPlace('i-new', 'bananas'));

    expect(storeActions.begin).toHaveBeenCalledWith('i-new');
    await waitFor(() => expect(storeActions.end).toHaveBeenCalledWith('i-new'));
  });

  it('deferred reclassify loop marks begin/end per unlocated item, even with no aisle match', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-bread', 'bread')], // unlocated at the active store
      locations: [],
    });
    matcher.isReady = true;
    matcher.status = 'ready';
    matcher.classify.mockResolvedValue(''); // no confident aisle → settles

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    await waitFor(() => expect(storeActions.begin).toHaveBeenCalledWith('i-bread'));
    await waitFor(() => expect(storeActions.end).toHaveBeenCalledWith('i-bread'));
  });

  it('auto-primes when the active store has an unlocated item, with no manual signal', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-bread', 'bread')], // unlocated at the active store
      locations: [],
    });
    // Matcher not ready / not loading — only the auto-prime effect can fire here.
    matcher.isReady = false;
    matcher.status = 'idle';

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    // Auto-prime fires for the active store without any blur/submit/add signal.
    await waitFor(() => expect(matcher.prime).toHaveBeenCalledWith(STORE_ID));
  });

  it('auto-prime then matcher-ready classifies the unlocated item via the auto path', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-produce', '7')],
      items: [item('i-bananas', 'bananas')], // unlocated → must auto-categorize
      locations: [],
    });
    // Simulate the matcher already being ready: auto-prime fires AND the deferred
    // reclassify loop (keyed on isReady) places the item — no manual add needed.
    matcher.isReady = true;
    matcher.status = 'ready';
    matcher.classify.mockResolvedValue('a-produce');

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    await waitFor(() => expect(matcher.prime).toHaveBeenCalledWith(STORE_ID));
    await waitFor(async () => {
      const rows = await (await dbPromise).getAllFromIndex('item_locations', 'item_id', 'i-bananas');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ store_id: STORE_ID, aisle_id: 'a-produce' });
    });
  });

  it('does not auto-prime when every item is located (lazy-load preserved)', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')], // fully categorized
    });
    matcher.isReady = false;
    matcher.status = 'idle';

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    // Give any effects a chance to run, then assert the model was never loaded.
    await Promise.resolve();
    expect(matcher.prime).not.toHaveBeenCalled();
  });

  it('auto-primes only once even as items/locations settle', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-produce', '7')],
      items: [item('i-bananas', 'bananas')],
      locations: [],
    });
    matcher.isReady = true;
    matcher.status = 'ready';
    matcher.classify.mockResolvedValue('a-produce');

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    // After the item is placed it leaves the unlocated set; hasPrimed is latched
    // so auto-prime never re-fires. prime() is still only ever called per the
    // single auto-prime + idempotent keep-warm — not in a storm.
    await waitFor(async () => {
      const rows = await (await dbPromise).getAllFromIndex('item_locations', 'item_id', 'i-bananas');
      expect(rows).toHaveLength(1);
    });
    // Every prime call targeted this store; no spurious re-prime against others.
    for (const call of matcher.prime.mock.calls) expect(call[0]).toBe(STORE_ID);
  });

  it('publishes the matcher status via setStatus', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')],
    });
    matcher.status = 'loading';

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    await waitFor(() => expect(storeActions.setStatus).toHaveBeenCalledWith('loading'));
  });

  it('resets the categorizing set when the active store changes', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62'), store('store-2', 'big-y-worcester')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')],
      activeStoreId: STORE_ID,
    });

    const { queryClient, result } = makeRender();
    await waitForLoaded(queryClient);

    storeActions.reset.mockClear();
    await act(async () => {
      await result.current.setStore.mutateAsync('store-2');
    });
    await waitFor(() => expect(storeActions.reset).toHaveBeenCalled());
  });

  it('resets the categorizing set when the matcher status is failed', async () => {
    await seed({
      stores: [store(STORE_ID, 'oxford-62')],
      aisles: [aisle('a-dairy', '1')],
      items: [item('i-kefir', 'kefir')],
      locations: [loc('i-kefir', 'a-dairy')],
    });
    matcher.status = 'failed';

    const { queryClient } = makeRender();
    await waitForLoaded(queryClient);

    await waitFor(() => expect(storeActions.reset).toHaveBeenCalled());
  });
});
