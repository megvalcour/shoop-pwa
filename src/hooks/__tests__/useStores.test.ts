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
  it('returns the seeded Oxford Market Basket store', async () => {
    const { result } = renderHook(() => useStores(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].name).toBe('Oxford Market Basket #62');
  });
});

describe('useActiveStore', () => {
  it('returns the first store record', async () => {
    const { result } = renderHook(() => useActiveStore(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Oxford Market Basket #62');
  });
});
