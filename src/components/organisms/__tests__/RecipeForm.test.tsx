import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useRecipes', () => ({
  useSaveRecipe: vi.fn(),
  useUpdateRecipe: vi.fn(),
}));

const saveMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

async function setup(props: Partial<{ recipe: unknown; onSaved: () => void }> = {}) {
  const { useSaveRecipe, useUpdateRecipe } = await import('@/hooks/useRecipes');
  vi.mocked(useSaveRecipe).mockReturnValue({
    mutateAsync: saveMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useSaveRecipe>);
  vi.mocked(useUpdateRecipe).mockReturnValue({
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateRecipe>);
  const onSaved = props.onSaved ?? vi.fn();
  const { default: RecipeForm } = await import('@/components/organisms/RecipeForm');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<RecipeForm recipe={props.recipe as any} onSaved={onSaved} />);
  return { onSaved };
}

describe('RecipeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveMutateAsync.mockResolvedValue({ id: 'new-id' });
    updateMutateAsync.mockResolvedValue({ id: 'edit-id' });
  });

  it('disables save until the form is valid', async () => {
    await setup();
    const save = screen.getByRole('button', { name: /save recipe/i });
    expect(save).toBeDisabled();

    // Title alone is not enough — still needs a filled ingredient.
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Chili' } });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Ingredient 1'), {
      target: { value: '2 cups beans' },
    });
    expect(save).toBeEnabled();
  });

  it('disables save when servings is below 1', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Chili' } });
    fireEvent.change(screen.getByLabelText('Ingredient 1'), { target: { value: 'Beans' } });
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: /save recipe/i })).toBeDisabled();
    expect(screen.getByText(/serving count of 1 or more/i)).toBeInTheDocument();
  });

  it('pre-fills quantity/unit from the parser when an ingredient line is typed', async () => {
    await setup();
    fireEvent.change(screen.getByLabelText('Ingredient 1'), {
      target: { value: '2 cups black beans' },
    });
    expect(screen.getByLabelText('Quantity for ingredient 1')).toHaveValue(2);
    expect(screen.getByLabelText('Unit for ingredient 1')).toHaveValue('cups');
  });

  it('adds and removes ingredient rows', async () => {
    await setup();
    expect(screen.getAllByLabelText(/^Ingredient \d+$/)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getAllByLabelText(/^Ingredient \d+$/)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /remove ingredient 2/i }));
    expect(screen.getAllByLabelText(/^Ingredient \d+$/)).toHaveLength(1);
  });

  it('submits the normalized + parsed recipe shape on create', async () => {
    const { onSaved } = await setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Weeknight Chili' } });
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Ingredient 1'), {
      target: { value: '2 cups black beans' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    await waitFor(() => expect(saveMutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutateAsync).toHaveBeenCalledWith({
      title: 'Weeknight Chili',
      servings: 6,
      ingredients: [{ raw: '2 cups black beans', name: 'Black beans', quantity: 2, unit: 'cups' }],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('new-id'));
  });

  it('seeds from an existing recipe and updates it on edit', async () => {
    const recipe = {
      recipe: {
        id: 'r1',
        title: 'Old Title',
        source_url: 'https://example.com/r',
        servings: 4,
        created_at: 1,
      },
      ingredients: [
        {
          id: 'i1',
          recipe_id: 'r1',
          raw: '1 lb beef',
          canonical_name: 'beef',
          quantity: 1,
          unit: 'lb',
        },
      ],
    };
    const { onSaved } = await setup({ recipe });

    expect(screen.getByLabelText('Title')).toHaveValue('Old Title');
    expect(screen.getByLabelText('Ingredient 1')).toHaveValue('1 lb beef');

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Title' } });
    fireEvent.click(screen.getByRole('button', { name: /save recipe/i }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'r1',
      title: 'New Title',
      source_url: 'https://example.com/r',
      servings: 4,
      ingredients: [{ raw: '1 lb beef', name: 'Beef', quantity: 1, unit: 'lb' }],
    });
    expect(saveMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('edit-id'));
  });
});
