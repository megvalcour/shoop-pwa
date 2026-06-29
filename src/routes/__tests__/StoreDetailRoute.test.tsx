import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach } from 'vitest';
import StoreDetailRoute from '@/routes/StoreDetailRoute';
import { dbPromise } from '@/db/idbClient';
import type { Aisle, Store } from '@/db/schema';

const TEST_STORE: Store = {
  id: 'st-detail',
  name: 'Test Mart',
  address: '1 Test Way, Testville',
  slug: 'test-mart',
};

const TEST_AISLES: Aisle[] = [
  { id: 'a-c', store_id: 'st-detail', number: '2', label: 'Bakery', sort_order: 2 },
  { id: 'a-a', store_id: 'st-detail', number: '1', label: 'Dairy', sort_order: 0 },
  { id: 'a-b', store_id: 'st-detail', number: '', label: 'Produce', sort_order: 1 },
];

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/stores/:id', element: <StoreDetailRoute /> },
      { path: '/settings', element: <div>Settings Page</div> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('StoreDetailRoute', () => {
  beforeEach(async () => {
    const db = await dbPromise;
    for (const a of ['a-a', 'a-b', 'a-c']) await db.delete('aisles', a);
    await db.delete('stores', 'st-detail');
    await db.put('stores', TEST_STORE);
    for (const a of TEST_AISLES) await db.put('aisles', a);
  });

  it('renders the store name and address', async () => {
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Test Mart')).toBeInTheDocument());
    expect(screen.getByText('1 Test Way, Testville')).toBeInTheDocument();
  });

  it('lists aisle cards in sort_order', async () => {
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Dairy')).toBeInTheDocument());
    const labels = screen.getAllByText(/Dairy|Produce|Bakery/).map((el) => el.textContent);
    expect(labels).toEqual(['Dairy', 'Produce', 'Bakery']);
  });

  it('renders an Aisle badge for numbered aisles and Section for special sections', async () => {
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Dairy')).toBeInTheDocument());
    expect(screen.getByText('Aisle 1')).toBeInTheDocument();
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('exposes a reorder handle for each aisle', async () => {
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Dairy')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reorder Dairy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Produce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reorder Bakery' })).toBeInTheDocument();
  });

  it('renders "Store not found." for an unknown id', async () => {
    renderAt('/stores/does-not-exist');
    await waitFor(() => expect(screen.getByText('Store not found.')).toBeInTheDocument());
  });

  it('does not show a delete control for a built-in store', async () => {
    const db = await dbPromise;
    const oxford = (await db.getAll('stores')).find((s) => s.slug === 'oxford-62')!;
    renderAt(`/stores/${oxford.id}`);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Oxford Market Basket #62' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Delete store' })).not.toBeInTheDocument();
  });

  it('shows a delete control for a user store and opens the confirm dialog without deleting', async () => {
    const user = userEvent.setup();
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Test Mart')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete store' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    // Cancel closes the dialog and leaves the store in place.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const db = await dbPromise;
    expect(await db.get('stores', 'st-detail')).toBeDefined();
  });

  it('deletes the store on confirm and navigates back to Settings', async () => {
    const user = userEvent.setup();
    renderAt('/stores/st-detail');
    await waitFor(() => expect(screen.getByText('Test Mart')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete store' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Settings Page')).toBeInTheDocument());
    const db = await dbPromise;
    expect(await db.get('stores', 'st-detail')).toBeUndefined();
  });
});
