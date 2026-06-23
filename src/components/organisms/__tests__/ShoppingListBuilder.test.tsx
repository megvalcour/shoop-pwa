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
  useItemLocations: vi.fn(),
  useUpsertItemLocation: vi.fn(),
}));

vi.mock('@/hooks/useAisles', () => ({
  useAisles: vi.fn(),
}));

vi.mock('@/hooks/useStores', () => ({
  useActiveStore: vi.fn(),
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
  const { useItems, useItemLocations, useUpsertItemLocation } = await import('@/hooks/useItems');
  const { useAisles } = await import('@/hooks/useAisles');
  const { useActiveStore } = await import('@/hooks/useStores');
  const ShoppingListBuilder = (await import('@/components/organisms/ShoppingListBuilder'))
    .default;

  return {
    useListItems: vi.mocked(useListItems),
    useDeleteListItem: vi.mocked(useDeleteListItem),
    useToggleListItem: vi.mocked(useToggleListItem),
    useItems: vi.mocked(useItems),
    useItemLocations: vi.mocked(useItemLocations),
    useUpsertItemLocation: vi.mocked(useUpsertItemLocation),
    useAisles: vi.mocked(useAisles),
    useActiveStore: vi.mocked(useActiveStore),
    ShoppingListBuilder,
  };
}

const mockMutate = vi.fn();
const mockToggleMutate = vi.fn();
const mockUpsertMutate = vi.fn();

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

type Mocks = Awaited<ReturnType<typeof setup>>;

function loc(itemId: string, aisleId: string) {
  return { id: `loc-${itemId}`, item_id: itemId, store_id: 'store-1', aisle_id: aisleId };
}

describe('ShoppingListBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
    mockToggleMutate.mockReset();
    mockUpsertMutate.mockReset();
  });

  function defaultMocks(mocks: Mocks) {
    mocks.useDeleteListItem.mockReturnValue({ mutate: mockMutate } as unknown as ReturnType<typeof mocks.useDeleteListItem>);
    mocks.useToggleListItem.mockReturnValue({ mutate: mockToggleMutate } as unknown as ReturnType<typeof mocks.useToggleListItem>);
    mocks.useUpsertItemLocation.mockReturnValue({ mutate: mockUpsertMutate } as unknown as ReturnType<typeof mocks.useUpsertItemLocation>);
    mocks.useAisles.mockReturnValue({ data: [] } as unknown as ReturnType<typeof mocks.useAisles>);
    mocks.useItemLocations.mockReturnValue({ data: [] } as unknown as ReturnType<typeof mocks.useItemLocations>);
    mocks.useActiveStore.mockReturnValue({
      data: { id: 'store-1', name: 'Test', address: '', slug: 'oxford-62' },
    } as unknown as ReturnType<typeof mocks.useActiveStore>);
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
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk' }],
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
      data: [{ id: 'item-1', name: 'Bread', canonical_name: 'bread' }],
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
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByText('Milk').closest('li')!);

    expect(mockToggleMutate).toHaveBeenCalledWith({ id: 'li-1', listId: 'list-1' });
  });

  it('changing an aisle upserts an item_location for the active store', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useAisles.mockReturnValue({
      data: [AISLE_DAIRY, AISLE_BREAD],
    } as unknown as ReturnType<typeof mocks.useAisles>);

    mocks.useItemLocations.mockReturnValue({
      data: [loc('item-1', 'aisle-1')],
    } as unknown as ReturnType<typeof mocks.useItemLocations>);

    mocks.useListItems.mockReturnValue({
      data: [{ id: 'li-1', list_id: 'list-1', item_id: 'item-1', quantity: 1, checked: false, added_from_default: false }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof mocks.useListItems>);

    mocks.useItems.mockReturnValue({
      data: [{ id: 'item-1', name: 'Milk', canonical_name: 'milk' }],
    } as unknown as ReturnType<typeof mocks.useItems>);

    render(<mocks.ShoppingListBuilder listId="list-1" />, { wrapper: makeWrapper() });

    // Open the aisle picker for the row and choose a different aisle.
    fireEvent.click(screen.getByRole('button', { name: /change aisle/i }));
    fireEvent.click(screen.getByText('Aisle 21 — Bread & Bakery'));

    expect(mockUpsertMutate).toHaveBeenCalledWith({
      itemId: 'item-1',
      storeId: 'store-1',
      aisleId: 'aisle-21',
    });
  });

  it('checked items appear in Done group below aisle groups', async () => {
    const mocks = await setup();
    defaultMocks(mocks);

    mocks.useAisles.mockReturnValue({
      data: [AISLE_DAIRY],
    } as unknown as ReturnType<typeof mocks.useAisles>);

    mocks.useItemLocations.mockReturnValue({
      data: [loc('item-1', 'aisle-1'), loc('item-2', 'aisle-1')],
    } as unknown as ReturnType<typeof mocks.useItemLocations>);

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
        { id: 'item-1', name: 'Milk', canonical_name: 'milk' },
        { id: 'item-2', name: 'Eggs', canonical_name: 'eggs' },
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
