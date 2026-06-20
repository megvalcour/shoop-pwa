import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach } from 'vitest';
import ShopRoute from '@/routes/ShopRoute';
import { dbPromise } from '@/db/idbClient';

function renderShopRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/', element: <ShopRoute /> },
      { path: '/lists/:id', element: <div>List detail</div> },
    ],
    { initialEntries: ['/'] },
  );
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}

describe('ShopRoute', () => {
  beforeEach(async () => {
    const db = await dbPromise;
    await db.clear('shopping_lists');
  });

  it('shows loading state initially', () => {
    renderShopRoute();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows empty state and create button when no lists exist', async () => {
    renderShopRoute();
    await waitFor(() => {
      expect(screen.getByText(/no lists yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument();
  });

  it('redirects to /lists/:id when lists exist', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'abc-123', name: 'Test List', created_at: '2026-06-01T00:00:00.000Z' });

    const { router } = renderShopRoute();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/lists/abc-123');
    });
    expect(router.state.location.state).toBeNull();
  });

  it('create button calls mutation and navigates to new list', async () => {
    const user = userEvent.setup();
    const { router } = renderShopRoute();

    await waitFor(() => {
      expect(screen.getByText(/no lists yet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /new list/i }));

    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/lists\/[0-9a-f-]{36}$/);
    });
  });
});
