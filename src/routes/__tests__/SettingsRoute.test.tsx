import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SettingsRoute from '@/routes/SettingsRoute';
import { dbPromise } from '@/db/idbClient';

// SettingsRoute renders AppVersionPanel, which reads the PWA update context.
// Mock the hook so the route can render without a PwaUpdateProvider.
vi.mock('@/hooks/usePwaUpdate', () => ({
  usePwaUpdate: () => ({
    needRefresh: false,
    offlineReady: false,
    updateState: 'idle',
    checkForUpdate: vi.fn(),
    applyUpdate: vi.fn(),
  }),
}));

function renderSettingsRoute() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/settings', element: <SettingsRoute /> },
      { path: '/lists/:id', element: <div>List detail</div> },
      { path: '/default-list', element: <div>Default list</div> },
      { path: '/stores/:id', element: <div>Store detail</div> },
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
    await db.clear('list_items');
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

  it('renders the seeded store in the Your Stores section', async () => {
    renderSettingsRoute();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Your Stores' })).toBeInTheDocument();
    });
    expect(
      await screen.findByRole('button', { name: 'Oxford Market Basket #62' }),
    ).toBeInTheDocument();
  });

  it('clicking a store entry navigates to /stores/:id', async () => {
    const db = await dbPromise;
    const [store] = await db.getAll('stores');

    const user = userEvent.setup();
    const { router } = renderSettingsRoute();

    const entry = await screen.findByRole('button', { name: 'Oxford Market Basket #62' });
    await user.click(entry);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/stores/${store.id}`);
    });
  });

  it('Default List link is present', async () => {
    renderSettingsRoute();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /manage default items/i })).toBeInTheDocument();
    });
  });

  it('clicking a card delete affordance opens the confirm dialog without deleting', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-del', name: 'Doomed List', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Doomed List')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete list: Doomed List' }));

    expect(screen.getByRole('alertdialog', { name: 'Delete list?' })).toBeInTheDocument();
    // Still present in the DB (not deleted yet).
    expect(await db.get('shopping_lists', 'sl-del')).toBeTruthy();
  });

  it('cancelling the confirm dialog keeps the list', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-keep', name: 'Keep Me', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Keep Me')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete list: Keep Me' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Keep Me')).toBeInTheDocument();
  });

  it('confirming the dialog removes the card from Your Lists', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-gone', name: 'Goodbye List', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Goodbye List')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete list: Goodbye List' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Goodbye List')).not.toBeInTheDocument());
    expect(await db.get('shopping_lists', 'sl-gone')).toBeUndefined();
  });

  it('renders the About section with the app version', async () => {
    renderSettingsRoute();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument(),
    );
    expect(screen.getByText(`Shoop v${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument();
  });

  it('renders the Reset all data button', async () => {
    renderSettingsRoute();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reset all data' })).toBeInTheDocument(),
    );
  });

  it('clicking Reset all data opens the confirm dialog without resetting', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-r', name: 'Survivor', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Survivor')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reset all data' }));

    expect(screen.getByRole('alertdialog', { name: 'Reset all data?' })).toBeInTheDocument();
    expect(await db.get('shopping_lists', 'sl-r')).toBeTruthy();
  });

  it('cancelling the reset dialog keeps data', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-rk', name: 'Keep Through Reset', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Keep Through Reset')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reset all data' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Keep Through Reset')).toBeInTheDocument();
  });

  it('confirming the reset clears lists and preserves seeded store data', async () => {
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-wiped', name: 'Wiped List', created_at: '2026-06-01T00:00:00.000Z' });

    const user = userEvent.setup();
    renderSettingsRoute();

    await waitFor(() => expect(screen.getByText('Wiped List')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Reset all data' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(screen.queryByText('Wiped List')).not.toBeInTheDocument());
    expect(await db.count('shopping_lists')).toBe(0);
    expect(await db.count('stores')).toBe(1);
    expect(await db.count('items')).toBe(182);
  });
});
