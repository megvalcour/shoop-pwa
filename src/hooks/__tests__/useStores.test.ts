import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { useStores, useActiveStore } from '@/hooks/useStores';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useStores', () => {
  it('returns all seeded stores', async () => {
    const { result } = renderHook(() => useStores(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(3);
    const names = result.current.data!.map((s) => s.name).sort();
    expect(names).toEqual([
      'Big Y World Class Market',
      'General Store',
      'Oxford Market Basket #62',
    ]);
  });
});

describe('useActiveStore', () => {
  it('returns the default active store (Oxford Market Basket)', async () => {
    const { result } = renderHook(() => useActiveStore(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data?.name).toBe('Oxford Market Basket #62'));
  });
});
