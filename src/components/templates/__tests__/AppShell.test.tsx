import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import AppShell from '@/components/templates/AppShell';
import SettingsRoute from '@/routes/SettingsRoute';

// SettingsRoute renders AppVersionPanel, which reads the PWA update context.
// Mock the hook so the route renders without a PwaUpdateContext provider.
vi.mock('@/hooks/usePwaUpdate', () => ({
  usePwaUpdate: () => ({
    needRefresh: false,
    offlineReady: false,
    updateState: 'idle',
    checkForUpdate: vi.fn(),
    applyUpdate: vi.fn(),
  }),
}));

function renderWithRouter(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <div>Shop content</div> },
          { path: 'lists/:id', element: <div>List detail</div> },
          { path: 'stores/:id', element: <div>Store detail</div> },
          { path: 'eat', element: <div>Eat content</div> },
          { path: 'settings', element: <SettingsRoute /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders exactly 3 nav links: Shop, Eat and Settings', () => {
    renderWithRouter('/');
    expect(screen.getByText('Shop')).toBeInTheDocument();
    expect(screen.getByText('Eat')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.queryByText('Default List')).not.toBeInTheDocument();
  });

  it('Shop link is active on /', () => {
    renderWithRouter('/');
    expect(screen.getByRole('link', { name: /Shop/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Eat/ })).not.toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Settings/ })).not.toHaveClass('text-accent');
  });

  it('Eat link becomes active after navigating to /eat, and others are not', async () => {
    const user = userEvent.setup();
    renderWithRouter('/');
    await user.click(screen.getByRole('link', { name: /Eat/ }));
    expect(screen.getByRole('link', { name: /Eat/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Settings/ })).not.toHaveClass('text-accent');
  });

  it('Settings link becomes active after navigating to /settings', async () => {
    const user = userEvent.setup();
    renderWithRouter('/');
    await user.click(screen.getByRole('link', { name: /Settings/ }));
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
  });

  it('correct tab is highlighted on direct navigation to /settings', () => {
    renderWithRouter('/settings');
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
  });

  it('Shop tab is active when URL is /lists/:id', () => {
    renderWithRouter('/lists/some-uuid');
    expect(screen.getByRole('link', { name: /Shop/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Settings/ })).not.toHaveClass('text-accent');
  });

  it('Settings tab is active when URL is /stores/:id', () => {
    renderWithRouter('/stores/some-uuid');
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
  });

  it('shell root carries data-theme="eat" on /eat', () => {
    const { container } = renderWithRouter('/eat');
    expect(container.firstChild).toHaveAttribute('data-theme', 'eat');
  });

  it('shell root has no data-theme attribute off /eat', () => {
    const { container: home } = renderWithRouter('/');
    expect(home.firstChild).not.toHaveAttribute('data-theme');
    const { container: settings } = renderWithRouter('/settings');
    expect(settings.firstChild).not.toHaveAttribute('data-theme');
  });

  it('StoreHeader renders Oxford store name after DB loads', async () => {
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText('Oxford Market Basket #62')).toBeInTheDocument();
    });
  });
});
