import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useListItems', () => ({
  useListItems: vi.fn(),
  useDeleteListItem: vi.fn(),
}));

vi.mock('@/hooks/useItems', () => ({
  useItems: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

async function setup() {
  const { useListItems, useDeleteListItem } = await import('@/hooks/useListItems');
  const { useItems } = await import('@/hooks/useItems');
  const ShoppingListBuilder = (await import('@/components/organisms/ShoppingListBuilder'))
    .default;

  return {
    useListItems: vi.mocked(useListItems),
    useDeleteListItem: vi.mocked(useDeleteListItem),
    useItems: vi.mocked(useItems),
    ShoppingListBuilder,
  };
}

const mockMutate = vi.fn();

describe('ShoppingListBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
  });

  it('renders item names from the resolved items map', async () => {
    const { useListItems, useDeleteListItem, useItems, ShoppingListBuilder } = await setup();

    useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 2, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useListItems>);

    useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof useItems>);

    useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useDeleteListItem>);

    render(<ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('renders empty state when listItems is empty', async () => {
    const { useListItems, useDeleteListItem, useItems, ShoppingListBuilder } = await setup();

    useListItems.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useListItems>);

    useItems.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useItems>);
    useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useDeleteListItem>);

    render(<ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('renders loading state when isPending is true', async () => {
    const { useListItems, useDeleteListItem, useItems, ShoppingListBuilder } = await setup();

    useListItems.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useListItems>);

    useItems.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useItems>);
    useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useDeleteListItem>);

    render(<ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('clicking the trash button calls deleteItem.mutate with the correct args', async () => {
    const { useListItems, useDeleteListItem, useItems, ShoppingListBuilder } = await setup();

    useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useListItems>);

    useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Bread', canonical_name: 'bread', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof useItems>);

    useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof useDeleteListItem>);

    render(<ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /delete item/i }));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'li-1', listId: 'list-1' });
  });
});
