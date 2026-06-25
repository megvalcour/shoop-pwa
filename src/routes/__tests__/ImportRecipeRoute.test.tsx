import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

// Stub the organism so the test asserts only the URL the route derived.
vi.mock('@/components/organisms/RecipeImporter', () => ({
  default: ({ initialUrl }: { initialUrl?: string }) => (
    <div data-testid="importer">{initialUrl ?? 'NO_URL'}</div>
  ),
}));

async function renderAt(search: string) {
  const { default: ImportRecipeRoute } = await import('@/routes/ImportRecipeRoute');
  const router = createMemoryRouter([{ path: '/import', element: <ImportRecipeRoute /> }], {
    initialEntries: [`/import${search}`],
  });
  render(<RouterProvider router={router} />);
}

describe('ImportRecipeRoute', () => {
  it('uses the url param when present', async () => {
    await renderAt('?url=https%3A%2F%2Fexample.com%2Frecipe');
    expect(screen.getByTestId('importer')).toHaveTextContent('https://example.com/recipe');
  });

  it('falls back to the first http(s) token in text', async () => {
    await renderAt('?text=' + encodeURIComponent('Try this https://cook.test/pasta tonight'));
    expect(screen.getByTestId('importer')).toHaveTextContent('https://cook.test/pasta');
  });

  it('scans the title field when url and text have no link', async () => {
    await renderAt('?title=' + encodeURIComponent('Soup https://recipes.test/soup'));
    expect(screen.getByTestId('importer')).toHaveTextContent('https://recipes.test/soup');
  });

  it('renders the manual-paste state when nothing usable was shared', async () => {
    await renderAt('?text=' + encodeURIComponent('just some plain text'));
    expect(screen.getByTestId('importer')).toHaveTextContent('NO_URL');
  });

  it('ignores a non-http(s) url param', async () => {
    await renderAt('?url=' + encodeURIComponent('ftp://example.com/file'));
    expect(screen.getByTestId('importer')).toHaveTextContent('NO_URL');
  });
});
