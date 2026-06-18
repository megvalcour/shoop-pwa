import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import AppShell from '@/components/templates/AppShell';
import ShoppingListsRoute from '@/routes/ShoppingListsRoute';
import DefaultListRoute from '@/routes/DefaultListRoute';
import SettingsRoute from '@/routes/SettingsRoute';

function renderWithRouter(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <ShoppingListsRoute /> },
          { path: 'default-list', element: <DefaultListRoute /> },
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
  it('renders all three nav labels', () => {
    renderWithRouter('/');
    expect(screen.getByText('Shop')).toBeInTheDocument();
    expect(screen.getByText('Default List')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('Shop link is active on /', () => {
    renderWithRouter('/');
    expect(screen.getByRole('link', { name: /Shop/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Default List/ })).not.toHaveClass('text-accent');
  });

  it('Default List link becomes active and Shop becomes inactive after navigating to /default-list', async () => {
    const user = userEvent.setup();
    renderWithRouter('/');
    await user.click(screen.getByRole('link', { name: /Default List/ }));
    expect(screen.getByRole('link', { name: /Default List/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
  });

  it('correct tab is highlighted on direct navigation to /settings', () => {
    renderWithRouter('/settings');
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveClass('text-accent');
    expect(screen.getByRole('link', { name: /Shop/ })).not.toHaveClass('text-accent');
  });
});
