import { useNavigate } from 'react-router';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '@/components/atoms/Button';
import RecipeCard from '@/components/molecules/RecipeCard';
import { useRecipes } from '@/hooks/useRecipes';

/**
 * The Recipes section of the Eat tab (Phase 3): a state-aware library that shows
 * an empty-state CTA when no recipes exist, or a list of `RecipeCard`s linking to
 * each recipe's detail. Reads the persistent recipe list via `useRecipes`
 * (ADR-0004) and routes into the recipe surfaces under `/eat` (green theme,
 * ADR-0028). The "Add recipe" CTA opens the manual-entry form.
 */
export default function RecipeLibrary() {
  const navigate = useNavigate();
  const { data: recipes, isLoading } = useRecipes();

  return (
    <section className="px-4 pt-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display font-bold text-text text-lg">Recipes</h2>
        {recipes && recipes.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => navigate('/eat/recipes/new')}
            className="shrink-0"
          >
            Add recipe
          </Button>
        )}
      </div>

      {isLoading ? null : !recipes || recipes.length === 0 ? (
        <div className="flex flex-col gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon
              icon={faBookOpen}
              className="text-text-muted text-lg mt-0.5 shrink-0"
            />
            <span className="text-text-muted text-sm">
              No recipes yet. Save one from a recipe link, or add one by hand to start building your
              library.
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/eat/recipes/new')}
            className="self-start"
          >
            Add a recipe
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard
                recipe={recipe}
                ingredientCount={recipe.ingredientCount}
                onClick={() => navigate(`/eat/recipes/${recipe.id}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
