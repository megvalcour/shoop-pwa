import type { RecipeIngredient } from '@/db/schema';
import { formatQuantity } from '@/utils/formatQuantity';

/** Capitalize the first letter of the stored (lower-cased) canonical name. */
function displayName(canonical: string): string {
  return canonical.replace(/[a-z]/i, (ch) => ch.toUpperCase());
}

export interface RecipeIngredientRowProps {
  ingredient: RecipeIngredient;
}

/**
 * One ingredient line for the recipe detail view (Eat tab, Phase 3). Shows the
 * cleaned name with its quantity/unit, and the original raw line beneath when it
 * differs — mirroring the `RecipeImporter` label pattern as the mistranslation
 * guard. Presentational only; role tokens so it themes green under /eat.
 */
export default function RecipeIngredientRow({ ingredient }: RecipeIngredientRowProps) {
  const name = displayName(ingredient.canonical_name);
  const rawDiffers = ingredient.raw.trim().toLowerCase() !== ingredient.canonical_name;

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 bg-card rounded-xl shadow-card">
      <span className="flex flex-col min-w-0">
        <span className="text-text font-medium truncate">{name}</span>
        {rawDiffers && <span className="text-text-muted text-xs">{ingredient.raw}</span>}
      </span>
      <span className="text-sm font-bold tabular-nums text-text-muted shrink-0">
        {formatQuantity(ingredient.quantity, ingredient.unit)}
      </span>
    </li>
  );
}
