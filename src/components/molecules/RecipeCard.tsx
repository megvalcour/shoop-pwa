import { faLink } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { Recipe } from '@/db/schema';

export interface RecipeCardProps {
  recipe: Recipe;
  /** Ingredient count shown as a subtitle. */
  ingredientCount: number;
  onClick: () => void;
}

/**
 * Presentational summary row for the recipe library (Eat tab, Phase 3): title,
 * a servings + ingredient-count subtitle, and a link badge when the recipe was
 * imported from a URL. No store access; role tokens so it themes green under /eat.
 */
export default function RecipeCard({ recipe, ingredientCount, onClick }: RecipeCardProps) {
  const subtitle = `${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'} · ${ingredientCount} ${
    ingredientCount === 1 ? 'ingredient' : 'ingredients'
  }`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={recipe.title}
      className="w-full px-4 py-3 bg-card rounded-xl shadow-card flex items-center justify-between gap-3 text-left active:opacity-70"
    >
      <span className="flex flex-col min-w-0 gap-0.5">
        <span className="font-semibold text-text truncate">{recipe.title}</span>
        <span className="text-sm tabular-nums text-text-muted">{subtitle}</span>
      </span>
      {recipe.source_url && (
        <FontAwesomeIcon
          icon={faLink}
          className="text-text-muted text-sm shrink-0"
          aria-label="Imported from a link"
        />
      )}
    </button>
  );
}
