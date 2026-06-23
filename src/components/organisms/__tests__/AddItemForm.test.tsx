import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useListItems', () => ({ useAddListItem: vi.fn() }));
// The classification orchestration lives in its own hook (and is tested there).
// Here we stub it so the form's own behavior — submit, clear, refocus, no-disable
// — is exercised without the matcher/IndexedDB machinery.
vi.mock('@/hooks/useItemClassification', () => ({ useItemClassification: vi.fn() }));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockMutate = vi.fn();
const mockPrime = vi.fn();
const mockClassifyAndPlace = vi.fn();

async function setup({ isPending = false }: { isPending?: boolean } = {}) {
  const { useAddListItem } = await import('@/hooks/useListItems');
  const { useItemClassification } = await import('@/hooks/useItemClassification');
  const AddItemForm = (await import('@/components/organisms/AddItemForm')).default;

  vi.mocked(useAddListItem).mockReturnValue({
    mutate: mockMutate,
    isPending,
  } as unknown as ReturnType<typeof useAddListItem>);
  vi.mocked(useItemClassification).mockReturnValue({
    prime: mockPrime,
    classifyAndPlace: mockClassifyAndPlace,
    isClassifying: false,
  });

  render(<AddItemForm listId="list-1" />, { wrapper: makeWrapper() });
  return screen.getByPlaceholderText(/add an item/i) as HTMLInputElement;
}

describe('AddItemForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockReset();
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

  it('primes on submit and places the classified item on add success', async () => {
    mockMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ itemCreated: true, newItemId: 'item-new' });
    });

    const input = await setup();
    fireEvent.change(input, { target: { value: 'Bananas' } });
    fireEvent.submit(input.closest('form')!);

    expect(mockPrime).toHaveBeenCalledWith('Bananas');
    expect(mockClassifyAndPlace).toHaveBeenCalledWith('item-new', 'Bananas');
  });

  it('does not place a classification when no item id is returned', async () => {
    mockMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ itemCreated: false, newItemId: '' });
    });

    const input = await setup();
    fireEvent.change(input, { target: { value: 'Bread' } });
    fireEvent.submit(input.closest('form')!);

    expect(mockClassifyAndPlace).not.toHaveBeenCalled();
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
