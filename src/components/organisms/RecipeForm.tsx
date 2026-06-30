import { useState } from 'react';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import Input from '@/components/atoms/Input';
import LabeledField from '@/components/molecules/LabeledField';
import { useSaveRecipe, useUpdateRecipe } from '@/hooks/useRecipes';
import type { RecipeWithIngredients } from '@/hooks/useRecipes';
import { normalizeIngredient } from '@/utils/normalizeIngredient';
import { parseIngredientMeasure } from '@/utils/parseIngredientMeasure';

/**
 * Manual recipe create/edit form (Eat tab, Phase 3 — ADR-0004/0005). Title,
 * servings, and a list of ingredient lines: each line is free text that derives a
 * normalized name (`normalizeIngredient`) for storage and pre-fills an editable
 * quantity + unit via the recipe-scoped parser (`parseIngredientMeasure`). The
 * unsaved draft is LOCAL component state (ADR-0004: an in-flight form is ephemeral
 * UI, not a Zustand store), same posture as `EatProfileForm`. Writes go through
 * the recipe hooks; reuses `Input`/`Button` atoms and the `LabeledField` molecule.
 */

const DEFAULT_SERVINGS = 4;

interface IngredientDraft {
  key: string; // stable React key (the row id in edit mode)
  raw: string; // the free-text ingredient line
  quantity: string; // editable, parser-prefilled
  unit: string; // editable, parser-prefilled
}

/** Parser-derived quantity/unit defaults for a raw line, as display strings. */
function deriveMeasure(raw: string): { quantity: string; unit: string } {
  const measure = parseIngredientMeasure(raw);
  return {
    quantity: measure.quantity !== undefined ? String(measure.quantity) : '1',
    unit: measure.unit ?? '',
  };
}

function blankIngredient(): IngredientDraft {
  return { key: crypto.randomUUID(), raw: '', quantity: '1', unit: '' };
}

function seedIngredients(recipe?: RecipeWithIngredients): IngredientDraft[] {
  const existing = recipe?.ingredients ?? [];
  if (existing.length === 0) return [blankIngredient()];
  return existing.map((ingredient) => ({
    key: ingredient.id,
    raw: ingredient.raw,
    quantity: String(ingredient.quantity),
    unit: ingredient.unit,
  }));
}

export interface RecipeFormProps {
  /** Present in edit mode; absent for create. Drives the seed + which hook fires. */
  recipe?: RecipeWithIngredients;
  /** Called with the saved recipe id after a successful write. */
  onSaved: (recipeId: string) => void;
  /** Optional cancel affordance (the route wires it to navigate back). */
  onCancel?: () => void;
}

export default function RecipeForm({ recipe, onSaved, onCancel }: RecipeFormProps) {
  const saveRecipe = useSaveRecipe();
  const updateRecipe = useUpdateRecipe();

  const [title, setTitle] = useState(recipe?.recipe.title ?? '');
  const [servings, setServings] = useState(String(recipe?.recipe.servings ?? DEFAULT_SERVINGS));
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(() => seedIngredients(recipe));
  const [error, setError] = useState(false);

  const parsedServings = Number(servings);
  const servingsValid = Number.isInteger(parsedServings) && parsedServings >= 1;
  const filledIngredients = ingredients.filter((row) => row.raw.trim().length > 0);
  const isValid = title.trim().length > 0 && servingsValid && filledIngredients.length > 0;
  const isPending = saveRecipe.isPending || updateRecipe.isPending;

  function updateRow(key: string, patch: Partial<IngredientDraft>) {
    setIngredients((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  // Editing the raw line re-derives the quantity/unit pre-fill (a convenience);
  // the user can adjust either afterwards.
  function updateRaw(key: string, raw: string) {
    setIngredients((prev) =>
      prev.map((row) => (row.key === key ? { ...row, raw, ...deriveMeasure(raw) } : row)),
    );
  }

  function addRow() {
    setIngredients((prev) => [...prev, blankIngredient()]);
  }

  function removeRow(key: string) {
    setIngredients((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length === 0 ? [blankIngredient()] : next;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;

    const rows = filledIngredients.map((row) => ({
      raw: row.raw.trim(),
      name: normalizeIngredient(row.raw).name,
      quantity: Number(row.quantity) || 1,
      unit: row.unit.trim(),
    }));

    setError(false);
    try {
      if (recipe) {
        const updated = await updateRecipe.mutateAsync({
          id: recipe.recipe.id,
          title,
          source_url: recipe.recipe.source_url,
          servings: parsedServings,
          ingredients: rows,
        });
        onSaved(updated.id);
      } else {
        const created = await saveRecipe.mutateAsync({
          title,
          servings: parsedServings,
          ingredients: rows,
        });
        onSaved(created.id);
      }
    } catch {
      setError(true);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <LabeledField htmlFor="recipe-title" label="Title">
        <Input
          id="recipe-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Weeknight chili"
          className="w-full"
        />
      </LabeledField>

      <LabeledField
        htmlFor="recipe-form-servings"
        label="Servings"
        error={servingsValid ? undefined : 'Enter a serving count of 1 or more'}
      >
        <Input
          id="recipe-form-servings"
          type="number"
          inputMode="numeric"
          min={1}
          value={servings}
          onChange={(event) => setServings(event.target.value)}
          className="w-24"
        />
      </LabeledField>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text">Ingredients</span>
        {ingredients.map((row, index) => (
          <div key={row.key} className="flex items-start gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <Input
                type="text"
                aria-label={`Ingredient ${index + 1}`}
                value={row.raw}
                onChange={(event) => updateRaw(row.key, event.target.value)}
                placeholder="e.g. 2 cups black beans"
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  aria-label={`Quantity for ingredient ${index + 1}`}
                  value={row.quantity}
                  onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                  className="w-20"
                />
                <Input
                  type="text"
                  aria-label={`Unit for ingredient ${index + 1}`}
                  value={row.unit}
                  onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                  placeholder="unit (optional)"
                  className="flex-1"
                />
              </div>
            </div>
            <Button
              variant="danger"
              shape="icon"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove ingredient ${index + 1}`}
              className="mt-1 shrink-0"
            >
              <Icon icon={faTrash} />
            </Button>
          </div>
        ))}
        <Button variant="secondary" onClick={addRow} className="self-start">
          <span className="flex items-center gap-2">
            <Icon icon={faPlus} />
            Add ingredient
          </span>
        </Button>
      </div>

      {error && (
        <p className="text-destructive text-sm">Couldn’t save the recipe. Please try again.</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!isValid || isPending}>
          {isPending ? 'Saving…' : 'Save recipe'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
