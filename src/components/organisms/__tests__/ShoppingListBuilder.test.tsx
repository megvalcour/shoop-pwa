import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useListItems', () => ({
  useListItems: vi.fn(),
  useDeleteListItem: vi.fn(),
  useToggleListItem: vi.fn(),
}));

vi.mock('@/hooks/useItems', () => ({
  useItems: vi.fn(),
  useUpdateItemAisle: vi.fn(),
}));

vi.mock('@/hooks/useAisles', () => ({
  useAisles: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

async function setup() {
  const { useListItems, useDeleteListItem, useToggleListItem } = await import(
    '@/hooks/useListItems'
  );
  const { useItems, useUpdateItemAisle } = await import('@/hooks/useItems');
  const { useAisles } = await import('@/hooks/useAisles');
  const ShoppingListBuilder = (await import('@/components/organisms/ShoppingListBuilder'))
    .default;

  return {
    useListItems: vi.mocked(useListItems),
    useDeleteListItem: vi.mocked(useDeleteListItem),
    useToggleListItem: vi.mocked(useToggleListItem),
    useItems: vi.mocked(useItems),
    useUpdateItemAisle: vi.mocked(useUpdateItemAisle),
    useAisles: vi.mocked(useAisles),
    ShoppingListBuilder,
  };
}

const mockMutate = vi.fn();
const mockToggleMutate = vi.fn();
const mockUpdateAisleMutate = vi.fn();

const AISLE_DAIRY = {
  id: 'aisle-1',
  store_id: 'store-1',
  number: '1',
  label: 'Dairy & Eggs',
  sort_order: 1,
};

const AISLE_BREAD = {
  id: 'aisle-21',
  store_id: 'store-1',
  number: '21',
  label: 'Bread & Bakery',
  sort_order: 21,
};

describe('ShoppingListBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
    mockToggleMutate.mockReset();
    mockUpdateAisleMutate.mockReset();
  });

  function defaultMocks(mocks: Awaited<ReturnType<typeof setup>>) {
    mocks.useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof mocks.useDeleteListItem>);
    mocks.useToggleListItem.mockReturnValue({ mutate: mockToggleMutate } as unknown as ReturnType<typeof mocks.useToggleListItem>);
    mocks.useUpdateItemAisle.mockReturnValue({ mutate: mockUpdateAisleMutate } as unknown as ReturnType<typeof mocks.useUpdateItemAisle>);
    mocks.useAisles.mockReturnValue({ data: [] } as unknown as ReturnType<typeof mocks.useAisles>);
  }

  it('renders item names from the resolved items map', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 2, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('renders empty state when listItems is empty', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({ data: [] } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('renders loading state when isPending is true', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('clicking the trash button calls deleteItem.mutate with the correct args', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Bread', canonical_name: 'bread', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByRole('button', { name: /delete item/i }));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'li-1', listId: 'list-1' });
  });

  it('clicking a row calls toggleItem.mutate with the correct args', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByText('Milk').closest('li')!);

    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'li-1', listId: 'list-1' });
  });

  it('unchecked items with known aisle_id are grouped under the correct AisleGroup header', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useAisles.mockReturnValue({
      data: [AISLE_DAIRY, AISLE_BREAD],
    } as unknown as ReturnType<typeof mocks.useAisles>);

    mocks.useListItems.mockReturnValue({
      data: [
        { id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false },
        { id: 'li-2', list_id: 'list-1', item_id: 'item-2', quantity: 1, checked: false, added_from_default: false },
      ],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [
        { id: 'item-1', name: 'Milk', canonical_name: 'milk', aisle_id: 'aisle-1', store_id: 'store-1' },
        { id: 'item-2', name: 'Bread', canonical_name: 'bread', aisle_id: 'aisle-21', store_id: 'store-1' },
      ],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Aisle 1 — Dairy & Eggs')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Aisle 21 — Bread & Bakery')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
  });

  it('items with aisle_id empty string appear in Uncategorized group', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useListItems.mockReturnValue({
      data: [
        { id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false },
      ],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Mystery Item', canonical_name: 'mystery item', aisle_id: '', store_id: 'store-1' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    expect(screen.getByText('Mystery Item')).toBeInTheDocument();
  });

  it('checked items appear in Done group below aisle groups', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useAisles.mockReturnValue({
      data: [AISLE_DAIRY],
    } as unknown as ReturnType<typeof mocks.useAisles>);

    mocks.useListItems.mockReturnValue({
      data: [
        { id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false },
        { id: 'li-2', list_id: 'list-1', item_id: 'item-2', quantity: 1, checked: true, added_from_default: false },
      ],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [
        { id: 'item-1', name: 'Milk', canonical_name: 'milk', aisle_id: 'aisle-1', store_id: 'store-1' },
        { id: 'item-2', name: 'Eggs', canonical_name: 'eggs', aisle_id: 'aisle-1', store_id: 'store-1' },
      ],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Eggs')).toBeInTheDocument();

    const doneHeader = screen.getByText('Done');
    const milkEl = screen.getByText('Milk');
    // Done section appears after aisle groups in DOM
    expect(
      doneHeader.compareDocumentPosition(milkEl) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });
});
