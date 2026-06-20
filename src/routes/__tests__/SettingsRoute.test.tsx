import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach } from 'vitest';
import SettingsRoute from '@/routes/SettingsRoute';
import { dbPromise } from '@/db/idbClient';

function renderSettingsRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <SettingsRoute /> },
      { path: '/lists/:id', element: <div>List detail</div> },
      { path: '/default-list', element: <div>Default list</div> },
    ],
    { initialEntries: ['/settings'] },
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

describe('SettingsRoute', () => {
  beforeEach(async () => {
    const db = await dbPromise;
    await db.clear('shopping_lists');
  });

  it('renders empty state within Your Lists section when no lists', async () => {
    renderSettingsRoute();
    await waitFor(() => {
      expect(screen.getByText('No lists yet.')).toBeInTheDocument();
    });
  });

  it('renders shopping list cards when lists exist', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-1', name: 'Oxford - June 1', created_at: '2026-06-01T00:00:00.000Z' });

    renderSettingsRoute();

    await waitFor(() => {
      expect(screen.getByText('Oxford - June 1')).toBeInTheDocument();
    });
  });

  it('clicking a list card navigates to /lists/:id', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-nav', name: 'Test List', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    const { router } = renderSettingsRoute();

    await waitFor(() => {
      expect(screen.getByText('Test List')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Test List'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/lists/sl-nav');
    });
  });

  it('Default List link is present', async () => {
    renderSettingsRoute();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /manage default items/i })).toBeInTheDocument();
    });
  });
});
