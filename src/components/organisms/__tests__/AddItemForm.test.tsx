import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useListItems', () => ({ useAddListItem: vi.fn() }));
vi.mock('@/hooks/useItems', () => ({ useItems: vi.fn(), useUpdateItemAisle: vi.fn() }));
vi.mock('@/hooks/useAisles', () => ({ useAisles: vi.fn() }));
vi.mock('@/hooks/useAisleMatcher', () => ({ useAisleMatcher: vi.fn() }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockMutate = vi.fn();
const mockUpdateAisleMutate = vi.fn();
const mockPrime = vi.fn();
const mockClassify = vi.fn().mockResolvedValue('');

async function setup({ isPending = false }: { isPending?: boolean } = {}) {
  const { useAddListItem } = await import('@/hooks/useListItems');
  const { useItems, useUpdateItemAisle } = await import('@/hooks/useItems');
  const { useAisles } = await import('@/hooks/useAisles');
  const { useAisleMatcher } = await import('@/hooks/useAisleMatcher');
  const AddItemForm = (await import('@/components/organisms/AddItemForm')).default;

  vi.mocked(useAddListItem).mockReturnValue({
    mutate: mockMutate,
    isPending,
  } as unknown as ReturnType<typeof useAddListItem>);
  vi.mocked(useItems).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useItems>);
  vi.mocked(useUpdateItemAisle).mockReturnValue({
    mutate: mockUpdateAisleMutate,
  } as unknown as ReturnType<typeof useUpdateItemAisle>);
  vi.mocked(useAisles).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useAisles>);
  vi.mocked(useAisleMatcher).mockReturnValue({
    prime: mockPrime,
    classify: mockClassify,
    isReady: false,
  });

  render(<AddItemForm listId="list-1" />, { wrapper: makeWrapper() });
  return screen.getByPlaceholderText(/add an item/i) as HTMLInputElement;
}

describe('AddItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
    mockClassify.mockResolvedValue('');
  });

  it('keeps focus in the input and clears it after submitting via Enter', async () => {
    const input = await setup();
    input.focus();
    fireEvent.change(input, { target: { value: 'Milk' } });
    fireEvent.submit(input.closest('form')!);

    expect(mockMutate).toHaveBeenCalledWith(
      { listId: 'list-1', name: 'Milk' },
      expect.anything(),
    );
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('returns focus to the input and clears it after tapping the Add button', async () => {
    const input = await setup();
    fireEvent.change(input, { target: { value: 'Bread' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(mockMutate).toHaveBeenCalledWith(
      { listId: 'list-1', name: 'Bread' },
      expect.anything(),
    );
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('does not submit (or clear) when the input is empty or whitespace', async () => {
    const input = await setup();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('never disables the input while a mutation is pending', async () => {
    const input = await setup({ isPending: true });
    expect(input).not.toBeDisabled();
  });

  it('supports back-to-back entry without re-focusing the field', async () => {
    const input = await setup();
    input.focus();

    for (const name of ['Milk', 'Bread', 'Eggs']) {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.submit(input.closest('form')!);
      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    }

    expect(mockMutate).toHaveBeenCalledTimes(3);
  });
});
