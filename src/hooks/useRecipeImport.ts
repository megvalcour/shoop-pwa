/**
 * Client data hook for recipe import (Step 3). Wraps the `/api/import-recipe`
 * Cloudflare Pages Function in a TanStack Query, per the data-layer rule (no
 * inline fetch in components; query keys/caching live here — ADR-0004).
 *
 * The query is enabled only for a syntactically valid `http(s)` URL, sends the
 * shared import token from `VITE_IMPORT_TOKEN` (defense-in-depth #2 — see
 * ADR-0019; it ships in the bundle and is not a real secret), and maps the
 * endpoint's typed error responses (400/401/422/502) onto a `RecipeImportError`
 * so the UI can show the right empty/error state.
 */

import { useQuery } from '@tanstack/react-query';

/** Stable, machine-readable failure reasons surfaced to the import UI. */
export type RecipeImportErrorCode =
  | 'invalid_url' // 400 — URL missing / malformed / blocked
  | 'not_configured' // 401 — IMPORT_TOKEN not bound on the function
  | 'unauthorized' // 401 — token missing / mismatched
  | 'no_recipe' // 422 — no parseable Recipe JSON-LD on the page
  | 'fetch_failed' // 502 — upstream fetch failed / over budget
  | 'unknown'; // anything else (network error, unexpected status)

/** Error thrown by the import query, carrying the typed code and HTTP status. */
export class RecipeImportError extends Error {
  readonly code: RecipeImportErrorCode;
  readonly status?: number;

  constructor(code: RecipeImportErrorCode, status?: number) {
    super(`Recipe import failed: ${code}`);
    this.name = 'RecipeImportError';
    this.code = code;
    this.status = status;
  }
}

/** Successful import payload (mirrors the endpoint's 200 contract). */
export interface RecipeImportResult {
  title: string | null;
  ingredients: string[];
  sourceUrl: string;
}

const TOKEN_HEADER = 'X-Shoop-Import';

/** The endpoint's own error codes, used to validate a response body. */
const ENDPOINT_CODES: readonly RecipeImportErrorCode[] = [
  'invalid_url',
  'not_configured',
  'unauthorized',
  'no_recipe',
  'fetch_failed',
];

/** True for a well-formed `http(s)` URL. Mirrors the endpoint's scheme check. */
export function isValidRecipeUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Map a non-OK response onto a typed code, preferring the body's `error`. */
async function readErrorCode(response: Response): Promise<RecipeImportErrorCode> {
  let bodyCode: string | undefined;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === 'string') bodyCode = body.error;
  } catch {
    // Non-JSON body — fall through to status mapping below.
  }

  if (bodyCode && (ENDPOINT_CODES as readonly string[]).includes(bodyCode)) {
    return bodyCode as RecipeImportErrorCode;
  }

  switch (response.status) {
    case 400:
      return 'invalid_url';
    case 401:
      return 'unauthorized';
    case 422:
      return 'no_recipe';
    case 502:
      return 'fetch_failed';
    default:
      return 'unknown';
  }
}

async function fetchRecipe(url: string): Promise<RecipeImportResult> {
  const token = import.meta.env.VITE_IMPORT_TOKEN ?? '';

  let response: Response;
  try {
    response = await fetch(`/api/import-recipe?url=${encodeURIComponent(url)}`, {
      headers: { [TOKEN_HEADER]: token },
    });
  } catch {
    // Network failure (offline, DNS, etc.) — distinct from an endpoint error.
    throw new RecipeImportError('unknown');
  }

  if (!response.ok) {
    throw new RecipeImportError(await readErrorCode(response), response.status);
  }

  const data = (await response.json()) as Partial<RecipeImportResult>;
  return {
    title: typeof data.title === 'string' ? data.title : null,
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients.filter((entry): entry is string => typeof entry === 'string')
      : [],
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : url,
  };
}

/**
 * Fetch + parse a recipe from `url`. Disabled (idle) until `url` is a valid
 * `http(s)` URL. Recipes don't change, so the result is cached indefinitely;
 * 4xx responses are not retried (a missing token or absent recipe won't fix
 * itself), while a transient network/5xx error is retried once.
 */
export function useRecipeImport(url: string | undefined) {
  return useQuery<RecipeImportResult, RecipeImportError>({
    queryKey: ['recipe-import', url],
    enabled: isValidRecipeUrl(url),
    queryFn: () => fetchRecipe(url as string),
    staleTime: Infinity,
    retry: (failureCount, error) => {
      const status = error.status ?? 0;
      if (status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
  });
}
