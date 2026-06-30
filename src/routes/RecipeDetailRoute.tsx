import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { faPen, faTrash, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import ConfirmDialog from '@/components/molecules/ConfirmDialog';
import RecipeIngredientRow from '@/components/molecules/RecipeIngredientRow';
import { useRecipe, useDeleteRecipe } from '@/hooks/useRecipes';

/**
 * Recipe detail (Eat tab, Phase 3). Shows a saved recipe's title, servings, the
 * source link when it was imported, and its ingredient lines. Offers Edit (manual
 * form) and Delete (confirm → cascade-delete → back to the Eat landing). Renders
 * under `/eat` so it inherits the green sub-theme (ADR-0028).
 */
export default function RecipeDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isPending } = useRecipe(id);
  const deleteRecipe = useDeleteRecipe();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full px-4">
        <span className="text-text-muted">That recipe couldn’t be found.</span>
        <Button variant="secondary" onClick={() => navigate('/eat')}>
          Back to Eat
        </Button>
      </div>
    );
  }

  const { recipe, ingredients } = data;

  async function handleDelete() {
    await deleteRecipe.mutateAsync(recipe.id);
    navigate('/eat');
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="font-display font-extrabold text-ink text-2xl">{recipe.title}</h1>
        <span className="text-text-muted text-sm">
          {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}
        </span>
        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-accent text-sm font-medium w-fit"
          >
            View source
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-xs" />
          </a>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-display font-bold text-text text-base">
          {ingredients.length} {ingredients.length === 1 ? 'ingredient' : 'ingredients'}
        </h2>
        {ingredients.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {ingredients.map((ingredient) => (
              <RecipeIngredientRow key={ingredient.id} ingredient={ingredient} />
            ))}
          </ul>
        ) : (
          <p className="text-text-muted text-sm">No ingredients on this recipe.</p>
        )}
      </section>

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => navigate(`/eat/recipes/${recipe.id}/edit`)}>
          <span className="flex items-center gap-2">
            <Icon icon={faPen} />
            Edit
          </span>
        </Button>
        <Button
          variant="danger"
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete recipe: ${recipe.title}`}
        >
          <span className="flex items-center gap-2">
            <Icon icon={faTrash} />
            Delete
          </span>
        </Button>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete recipe?"
          message={`“${recipe.title}” and its ingredients will be permanently removed.`}
          isPending={deleteRecipe.isPending}
          errorMessage={deleteRecipe.isError ? 'Couldn’t delete the recipe. Try again.' : undefined}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
