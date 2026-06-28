import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { RecipeImportResult } from '@/hooks/useRecipeImport';
import type { ShoppingList } from '@/db/schema';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Keep isValidRecipeUrl real; only stub the query hook.
vi.mock('@/hooks/useRecipeImport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useRecipeImport')>();
  return { ...actual, useRecipeImport: vi.fn() };
});
vi.mock('@/hooks/useShoppingLists', () => ({
  useShoppingLists: vi.fn(),
  useCreateShoppingList: vi.fn(),
  useRenameShoppingList: vi.fn(),
}));
vi.mock('@/hooks/useListItems', () => ({ useAddListItem: vi.fn() }));
vi.mock('@/hooks/useDefaultList', () => ({ useAddDefaultListItem: vi.fn() }));

const mockCreate = vi.fn();
const mockRename = vi.fn();
const mockAddListItem = vi.fn();
const mockAddDefault = vi.fn();

interface SetupOptions {
  data?: RecipeImportResult;
  isFetching?: boolean;
  isError?: boolean;
  errorCode?: import('@/hooks/useRecipeImport').RecipeImportErrorCode;
  lists?: ShoppingList[];
  initialUrl?: string;
}

async function setup(options: SetupOptions = {}) {
  const {
    data,
    isFetching = false,
    isError = false,
    errorCode = 'no_recipe',
    lists = [],
    initialUrl = 'https://example.com/recipe',
  } = options;

  const { useRecipeImport } = await import('@/hooks/useRecipeImport');
  const { useShoppingLists, useCreateShoppingList, useRenameShoppingList } = await import(
    '@/hooks/useShoppingLists'
  );
  const { useAddListItem } = await import('@/hooks/useListItems');
  const { useAddDefaultListItem } = await import('@/hooks/useDefaultList');

  vi.mocked(useRecipeImport).mockReturnValue({
    data,
    isSuccess: data !== undefined,
    isFetching,
    isError,
    error: isError ? { code: errorCode } : null,
  } as unknown as ReturnType<typeof useRecipeImport>);
  vi.mocked(useShoppingLists).mockReturnValue({ data: lists } as unknown as ReturnType<
    typeof useShoppingLists
  >);
  vi.mocked(useCreateShoppingList).mockReturnValue({
    mutateAsync: mockCreate,
  } as unknown as ReturnType<typeof useCreateShoppingList>);
  vi.mocked(useRenameShoppingList).mockReturnValue({
    mutateAsync: mockRename,
  } as unknown as ReturnType<typeof useRenameShoppingList>);
  vi.mocked(useAddListItem).mockReturnValue({
    mutateAsync: mockAddListItem,
  } as unknown as ReturnType<typeof useAddListItem>);
  vi.mocked(useAddDefaultListItem).mockReturnValue({
    mutateAsync: mockAddDefault,
  } as unknown as ReturnType<typeof useAddDefaultListItem>);

  const { default: RecipeImporter } = await import('@/components/organisms/RecipeImporter');
  render(createElement(RecipeImporter, { initialUrl }));
}

const SAMPLE: RecipeImportResult = {
  title: 'Pasta Bake',
  ingredients: ['2 cups flour', '1 tsp salt'],
  sourceUrl: 'https://example.com/recipe',
};

describe('RecipeImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'list-1' });
    mockRename.mockResolvedValue(undefined);
    mockAddListItem.mockResolvedValue(undefined);
    mockAddDefault.mockResolvedValue(undefined);
  });

  it('renders normalized ingredient names with the raw text beneath', async () => {
    await setup({ data: SAMPLE });
    // The cleaned name is the primary label; the raw line stays beneath as the
    // mistranslation guard. No quantity is parsed or shown (ADR-0021).
    expect(screen.getByText('Flour')).toBeInTheDocument();
    expect(screen.getByText('2 cups flour')).toBeInTheDocument();
    expect(screen.getByText('Salt')).toBeInTheDocument();
  });

  it('commits checked ingredients to a new list named after the recipe', async () => {
    await setup({ data: SAMPLE });
    fireEvent.click(screen.getByRole('button', { name: /add 2 items/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lists/list-1'));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockRename).toHaveBeenCalledWith({ id: 'list-1', name: 'Pasta Bake' });
    expect(mockAddListItem).toHaveBeenCalledTimes(2);
    // No quantity carried through; unit defaults to undefined (control untouched).
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Flour',
      unit: undefined,
    });
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Salt',
      unit: undefined,
    });
  });

  it('carries a unit set in the preview into the committed item', async () => {
    await setup({ data: SAMPLE });
    fireEvent.change(screen.getByLabelText('Unit for Flour'), { target: { value: 'cups' } });
    fireEvent.click(screen.getByRole('button', { name: /add 2 items/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lists/list-1'));
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Flour',
      unit: 'cups',
    });
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Salt',
      unit: undefined,
    });
  });

  it('omits unchecked ingredients from the commit', async () => {
    await setup({ data: SAMPLE });
    fireEvent.click(screen.getByText('Flour').closest('button')!);

    fireEvent.click(screen.getByRole('button', { name: /add 1 item/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lists/list-1'));
    expect(mockAddListItem).toHaveBeenCalledTimes(1);
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Salt',
      unit: undefined,
    });
  });

  it('adds to an existing list without creating one', async () => {
    await setup({
      data: SAMPLE,
      lists: [{ id: 'list-9', name: 'Weekend', created_at: '2026-06-01T00:00:00.000Z' }],
    });

    fireEvent.click(screen.getByRole('button', { name: /existing list/i }));
    fireEvent.click(screen.getByRole('button', { name: /add 2 items/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lists/list-9'));
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockAddListItem).toHaveBeenCalledWith({
      listId: 'list-9',
      name: 'Flour',
      unit: undefined,
    });
  });

  it('adds to the default list and navigates there', async () => {
    await setup({ data: SAMPLE });

    fireEvent.click(screen.getByRole('button', { name: /default list/i }));
    fireEvent.click(screen.getByRole('button', { name: /add 2 items/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/default-list'));
    expect(mockAddDefault).toHaveBeenCalledTimes(2);
    expect(mockAddDefault).toHaveBeenCalledWith({ name: 'Flour', unit: undefined });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows the manual-paste empty state when no URL was shared', async () => {
    await setup({ initialUrl: undefined });
    expect(screen.getByRole('heading', { name: /import from a recipe/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Recipe URL')).toBeInTheDocument();
  });

  it('maps a typed error to a friendly message', async () => {
    await setup({ data: undefined, isError: true, errorCode: 'no_recipe' });
    expect(screen.getByText(/couldn’t find a recipe/i)).toBeInTheDocument();
  });

  it('distinguishes a missing server token from a mismatched client token', async () => {
    await setup({ data: undefined, isError: true, errorCode: 'not_configured' });
    expect(screen.getByText(/isn’t enabled on the server/i)).toBeInTheDocument();

    await setup({ data: undefined, isError: true, errorCode: 'unauthorized' });
    expect(screen.getByText(/token doesn’t match the server/i)).toBeInTheDocument();
  });
});
