import { useNavigate, useParams } from 'react-router';
import Button from '@/components/atoms/Button';
import RecipeForm from '@/components/organisms/RecipeForm';
import { useRecipe } from '@/hooks/useRecipes';

/**
 * Hosts `RecipeForm` for both manual entry (`/eat/recipes/new`) and editing
 * (`/eat/recipes/:id/edit`) — the presence of a route `:id` picks create vs edit.
 * In edit mode it loads the recipe first (the form seeds from it), then routes to
 * the detail on save. Lives under `/eat` so it inherits the green theme (ADR-0028).
 */
export default function RecipeFormRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = id !== undefined;
  const { data, isPending } = useRecipe(id);

  const heading = isEdit ? 'Edit recipe' : 'New recipe';

  function content() {
    if (isEdit && isPending) {
      return (
        <div className="flex items-center justify-center py-10">
          <span className="text-text-muted">Loading…</span>
        </div>
      );
    }

    if (isEdit && !data) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <span className="text-text-muted">That recipe couldn’t be found.</span>
          <Button variant="secondary" onClick={() => navigate('/eat')}>
            Back to Eat
          </Button>
        </div>
      );
    }

    return (
      <RecipeForm
        recipe={isEdit ? data! : undefined}
        onSaved={(recipeId) => navigate(`/eat/recipes/${recipeId}`)}
        onCancel={() => navigate(isEdit ? `/eat/recipes/${id}` : '/eat')}
      />
    );
  }

  return (
    <div className="flex flex-col pb-24">
      <header className="px-4 pt-6">
        <h1 className="font-display font-extrabold text-ink text-2xl">{heading}</h1>
      </header>
      {content()}
    </div>
  );
}
