import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DefaultListEntry, Item } from '@/db/schema';

vi.mock('@/hooks/useDefaultList', () => ({
  useDefaultList: vi.fn(),
  useAddDefaultListItem: vi.fn(),
  useRemoveDefaultListItem: vi.fn(),
}));
vi.mock('@/hooks/useItems', () => ({ useItems: vi.fn() }));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockAdd = vi.fn();
const mockRemove = vi.fn();

async function setup({
  entries = [],
  items = [],
  isPending = false,
  isError = false,
}: {
  entries?: DefaultListEntry[];
  items?: Item[];
  isPending?: boolean;
  isError?: boolean;
} = {}) {
  const { useDefaultList, useAddDefaultListItem, useRemoveDefaultListItem } = await import(
    '@/hooks/useDefaultList'
  );
  const { useItems } = await import('@/hooks/useItems');

  vi.mocked(useDefaultList).mockReturnValue({
    data: entries,
    isPending,
    isError,
  } as unknown as ReturnType<typeof useDefaultList>);
  vi.mocked(useItems).mockReturnValue({ data: items } as unknown as ReturnType<typeof useItems>);
  vi.mocked(useAddDefaultListItem).mockReturnValue({
    mutate: mockAdd,
    isError: false,
  } as unknown as ReturnType<typeof useAddDefaultListItem>);
  vi.mocked(useRemoveDefaultListItem).mockReturnValue({
    mutate: mockRemove,
  } as unknown as ReturnType<typeof useRemoveDefaultListItem>);

  const { default: DefaultListEditor } = await import('@/components/organisms/DefaultListEditor');
  render(createElement(DefaultListEditor), { wrapper: makeWrapper() });
}

describe('DefaultListEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no entries', async () => {
    await setup({ entries: [], items: [] });
    expect(screen.getByText('No default items yet.')).toBeInTheDocument();
  });

  it('renders entries joined to catalog item names', async () => {
    await setup({
      entries: [{ id: 'd1', item_id: 'i1', quantity: 1, unit: '', notes: '' }],
      items: [{ id: 'i1', name: 'Milk', canonical_name: 'milk' }],
    });
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('adds a trimmed item on submit and clears the input', async () => {
    await setup({ entries: [], items: [] });
    const input = screen.getByPlaceholderText('Add a default item…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Eggs  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(mockAdd).toHaveBeenCalledWith('Eggs');
    expect(input.value).toBe('');
  });

  it('removes an entry when its delete button is clicked', async () => {
    await setup({
      entries: [{ id: 'd1', item_id: 'i1', quantity: 1, unit: '', notes: '' }],
      items: [{ id: 'i1', name: 'Milk', canonical_name: 'milk' }],
    });
    fireEvent.click(screen.getByLabelText('Delete item'));
    expect(mockRemove).toHaveBeenCalledWith('d1');
  });
});
