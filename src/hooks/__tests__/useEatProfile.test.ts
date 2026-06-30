import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { EatProfile } from '@/db/schema';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const SAMPLE: EatProfile = {
  age: 30,
  sex: 'female',
  weightKg: 65,
  heightCm: 165,
  activity: 'moderate',
  units: 'imperial',
  updated_at: 1719700000000,
};

describe('useEatProfile', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('returns null when no profile has been written', async () => {
    const { useEatProfile } = await import('@/hooks/useEatProfile');
    const { result } = renderHook(() => useEatProfile(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('parses a persisted JSON blob back into the profile shape', async () => {
    const { dbPromise, EAT_PROFILE_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('preferences', { key: EAT_PROFILE_KEY, value: JSON.stringify(SAMPLE) });

    vi.resetModules();
    const { useEatProfile } = await import('@/hooks/useEatProfile');
    const { result } = renderHook(() => useEatProfile(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SAMPLE);
  });

  it('returns null (never throws) on a corrupt blob', async () => {
    const { dbPromise, EAT_PROFILE_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('preferences', { key: EAT_PROFILE_KEY, value: '{not valid json' });

    vi.resetModules();
    const { useEatProfile } = await import('@/hooks/useEatProfile');
    const { result } = renderHook(() => useEatProfile(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useSetEatProfile', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('serializes the profile and round-trips through the read hook', async () => {
    const { useEatProfile, useSetEatProfile } = await import('@/hooks/useEatProfile');
    const wrapper = makeWrapper();
    const { result } = renderHook(() => ({ read: useEatProfile(), set: useSetEatProfile() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.read.isSuccess).toBe(true));
    expect(result.current.read.data).toBeNull();

    await act(() => result.current.set.mutateAsync(SAMPLE));

    // The mutation invalidates the query key, so the read recomputes to the saved value.
    await waitFor(() => expect(result.current.read.data).toEqual(SAMPLE));

    const { dbPromise, EAT_PROFILE_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    const pref = await db.get('preferences', EAT_PROFILE_KEY);
    expect(JSON.parse(pref!.value)).toEqual(SAMPLE);
  });
});
