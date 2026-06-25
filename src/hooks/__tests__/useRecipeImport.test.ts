import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  RecipeImportError,
  isValidRecipeUrl,
  useRecipeImport,
} from '@/hooks/useRecipeImport';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

/** Build a minimal `Response`-like stub for the mocked `fetch`. */
function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('isValidRecipeUrl', () => {
  it.each([
    ['https://example.com/recipe', true],
    ['http://example.com', true],
    ['ftp://example.com', false],
    ['not a url', false],
    ['', false],
    [undefined, false],
  ])('returns %s → %s', (input, expected) => {
    expect(isValidRecipeUrl(input as string | undefined)).toBe(expected);
  });
});

describe('useRecipeImport', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_IMPORT_TOKEN', 'test-token');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stays idle (disabled) when the url is undefined', async () => {
    const { result } = renderHook(() => useRecipeImport(undefined), {
      wrapper: makeWrapper(),
    });
    // give the query a tick to (not) run
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays idle when the url is not http(s)', async () => {
    const { result } = renderHook(() => useRecipeImport('ftp://example.com'), {
      wrapper: makeWrapper(),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches with the token header and returns the parsed result', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(200, {
        title: 'Banana Bread',
        ingredients: ['2 cups flour', '1 tsp salt'],
        sourceUrl: 'https://example.com/banana-bread',
      }),
    );

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/banana-bread'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      title: 'Banana Bread',
      ingredients: ['2 cups flour', '1 tsp salt'],
      sourceUrl: 'https://example.com/banana-bread',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      '/api/import-recipe?url=' +
        encodeURIComponent('https://example.com/banana-bread'),
    );
    expect((init as RequestInit).headers).toMatchObject({
      'X-Shoop-Import': 'test-token',
    });
  });

  it('coerces a missing title and non-string ingredients defensively', async () => {
    fetchMock.mockResolvedValue(
      mockResponse(200, { ingredients: ['ok', 42, null, 'fine'] }),
    );

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/r'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBeNull();
    expect(result.current.data?.ingredients).toEqual(['ok', 'fine']);
    expect(result.current.data?.sourceUrl).toBe('https://example.com/r');
  });

  it('maps a 422 to the no_recipe error code', async () => {
    fetchMock.mockResolvedValue(mockResponse(422, { error: 'no_recipe' }));

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/not-a-recipe'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(RecipeImportError);
    expect(result.current.error?.code).toBe('no_recipe');
    expect(result.current.error?.status).toBe(422);
  });

  it('maps a 502 to the fetch_failed error code', async () => {
    fetchMock.mockResolvedValue(mockResponse(502, { error: 'fetch_failed' }));

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/gated'),
      { wrapper: makeWrapper() },
    );

    // 5xx is retried once (~1s backoff), so allow extra time to settle.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error?.code).toBe('fetch_failed');
  });

  it('maps a 401 not_configured body to its own code', async () => {
    fetchMock.mockResolvedValue(mockResponse(401, { error: 'not_configured' }));

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/r'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('not_configured');
  });

  it('falls back to status mapping when the body has no usable code', async () => {
    fetchMock.mockResolvedValue(mockResponse(400, { something: 'else' }));

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/r'),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.code).toBe('invalid_url');
  });

  it('maps a network failure to the unknown error code', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(
      () => useRecipeImport('https://example.com/r'),
      { wrapper: makeWrapper() },
    );

    // A network error is retried once (~1s backoff), so allow extra time.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.error?.code).toBe('unknown');
    expect(result.current.error?.status).toBeUndefined();
  });
});
