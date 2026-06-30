import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import Spinner from '@/components/atoms/Spinner';
import LabeledField from '@/components/molecules/LabeledField';
import SelectionList from '@/components/molecules/SelectionList';
import QuantitySheet from '@/components/molecules/QuantitySheet';
import ImportTargetPicker from '@/components/molecules/ImportTargetPicker';
import type { ImportTarget } from '@/components/molecules/ImportTargetPicker';
import { useRecipeImport, isValidRecipeUrl } from '@/hooks/useRecipeImport';
import type { RecipeImportErrorCode } from '@/hooks/useRecipeImport';
import {
  useShoppingLists,
  useCreateShoppingList,
  useRenameShoppingList,
} from '@/hooks/useShoppingLists';
import { useAddListItem } from '@/hooks/useListItems';
import { useAddDefaultListItem } from '@/hooks/useDefaultList';
import { useSaveRecipe } from '@/hooks/useRecipes';
import { normalizeIngredient, UNIT_SUGGESTIONS } from '@/utils/normalizeIngredient';
import { parseIngredientMeasure } from '@/utils/parseIngredientMeasure';
import { formatQuantity } from '@/utils/formatQuantity';

/** Default recipe yield offered on the "Save as recipe" path; user-editable. */
const DEFAULT_SERVINGS = 4;

export interface RecipeImporterProps {
  /** URL handed in by the Share Target / route; absent for manual paste. */
  initialUrl?: string;
}

/** Human-readable copy for each typed import failure. */
const ERROR_MESSAGES: Record<RecipeImportErrorCode, string> = {
  invalid_url: "That doesn't look like a valid recipe link.",
  not_configured: 'Recipe import isn’t enabled on the server yet (no import token bound).',
  unauthorized: 'Recipe import token doesn’t match the server (check VITE_IMPORT_TOKEN).',
  no_recipe: 'Couldn’t find a recipe on that page. Try a direct recipe link.',
  fetch_failed: 'Couldn’t reach that page. Check the link and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/**
 * Recipe-import organism (ADR-0019). Fetches a recipe via `useRecipeImport`,
 * normalizes its ingredients into a prunable checklist, and commits the checked
 * ones to a chosen destination through the existing list/default-list hooks —
 * which fire the per-store aisle classification automatically (ADR-0011/0015).
 * No new placement or persistence logic lives here.
 */
export default function RecipeImporter({ initialUrl }: RecipeImporterProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(initialUrl);
  const [pasteValue, setPasteValue] = useState(initialUrl ?? '');

  const query = useRecipeImport(url);
  const { data: lists } = useShoppingLists();
  const createList = useCreateShoppingList();
  const renameList = useRenameShoppingList();
  const addListItem = useAddListItem();
  const addDefaultItem = useAddDefaultListItem();
  const saveRecipe = useSaveRecipe();

  const normalized = useMemo(
    () => (query.data?.ingredients ?? []).map((raw) => normalizeIngredient(raw)),
    [query.data],
  );
  // The recipe-scoped quantity/unit recovery (ADR-0021: a SEPARATE parser that
  // reads what normalizeIngredient discards). Only consumed on the recipe target.
  const measures = useMemo(
    () => normalized.map((ingredient) => parseIngredientMeasure(ingredient.raw)),
    [normalized],
  );

  const [target, setTarget] = useState<ImportTarget>({ kind: 'new' });
  const [servings, setServings] = useState(String(DEFAULT_SERVINGS));

  // Everything checked by default; reset whenever a fresh recipe loads.
  const [checked, setChecked] = useState<Set<number>>(new Set());
  // Per-row quantity/unit, indexed alongside `normalized`. '' unit means omit on
  // commit. Whenever a fresh recipe loads, everything re-checks.
  const [quantities, setQuantities] = useState<number[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  // Which row's QuantitySheet is open; null = closed.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  useEffect(() => {
    setChecked(new Set(normalized.map((_, index) => index)));
  }, [normalized]);

  // Quantity/unit defaults are TARGET-aware: the "Save as recipe" path pre-fills
  // each row from the parser, while the list/default paths keep defaulting to ×1
  // with no unit (ADR-0021's shopping semantics are untouched). Toggling the
  // target re-applies or clears the pre-fill, so a parsed value can never bleed
  // into a list/default commit. Manual QuantitySheet edits persist until the
  // target toggles or a new recipe loads.
  const recipeTarget = target.kind === 'recipe';
  useEffect(() => {
    if (recipeTarget) {
      setQuantities(measures.map((measure) => measure.quantity ?? 1));
      setUnits(measures.map((measure) => measure.unit ?? ''));
    } else {
      setQuantities(measures.map(() => 1));
      setUnits(measures.map(() => ''));
    }
    setEditingIndex(null);
  }, [recipeTarget, measures]);

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(false);

  const hasValidUrl = isValidRecipeUrl(url);
  const loading = hasValidUrl && query.isFetching && !query.data;
  const ready = query.isSuccess && query.data;
  const title = query.data?.title ?? null;

  // Servings is only consumed on the recipe target. A blank/0/NaN entry is
  // invalid there and blocks the commit; off the recipe target it is ignored.
  const parsedServings = Number(servings);
  const servingsValid = Number.isInteger(parsedServings) && parsedServings >= 1;

  function toggle(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setQuantity(index: number, value: number) {
    setQuantities((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function setUnit(index: number, value: string) {
    setUnits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function submitPaste(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = pasteValue.trim();
    if (isValidRecipeUrl(trimmed)) setUrl(trimmed);
  }

  async function commit() {
    const selected = normalized
      .map((ingredient, index) => ({
        ingredient,
        quantity: quantities[index] ?? 1,
        unit: units[index]?.trim() || undefined,
      }))
      .filter((_, index) => checked.has(index));
    if (selected.length === 0) return;

    setCommitting(true);
    setCommitError(false);
    try {
      if (target.kind === 'recipe') {
        const recipe = await saveRecipe.mutateAsync({
          title: title?.trim() || 'Imported recipe',
          source_url: query.data?.sourceUrl,
          servings: parsedServings,
          ingredients: selected.map(({ ingredient, quantity, unit }) => ({
            raw: ingredient.raw,
            name: ingredient.name,
            quantity,
            unit: unit ?? '',
          })),
        });
        navigate(`/eat/recipes/${recipe.id}`);
        return;
      }

      if (target.kind === 'default') {
        for (const { ingredient, quantity, unit } of selected) {
          await addDefaultItem.mutateAsync({ name: ingredient.name, quantity, unit });
        }
        navigate('/default-list');
        return;
      }

      let listId: string;
      if (target.kind === 'new') {
        const list = await createList.mutateAsync();
        listId = list.id;
        if (title) await renameList.mutateAsync({ id: listId, name: title });
      } else {
        listId = target.listId;
      }

      for (const { ingredient, quantity, unit } of selected) {
        await addListItem.mutateAsync({ listId, name: ingredient.name, quantity, unit });
      }
      navigate(`/lists/${listId}`);
    } catch {
      setCommitError(true);
    } finally {
      setCommitting(false);
    }
  }

  if (ready) {
    const checkedCount = checked.size;
    return (
      <div className="flex flex-col gap-6 px-4 py-6">
        <header>
          <h1 className="font-display font-bold text-text text-xl">{title ?? 'Imported recipe'}</h1>
          <p className="text-text-muted text-sm">
            {normalized.length} {normalized.length === 1 ? 'ingredient' : 'ingredients'} found.
            Uncheck anything you don’t need.
          </p>
        </header>

        <section>
          <SelectionList
            items={normalized}
            getKey={(_, index) => String(index)}
            isSelected={(_, index) => checked.has(index)}
            renderLabel={(ingredient) => (
              <span className="flex flex-col">
                <span>{ingredient.name}</span>
                {ingredient.raw !== ingredient.name && (
                  <span className="text-text-muted text-xs">{ingredient.raw}</span>
                )}
              </span>
            )}
            renderAccessory={(_, index) => (
              <button
                type="button"
                className="text-sm font-bold tabular-nums text-text-muted underline decoration-dotted underline-offset-2"
                onClick={() => setEditingIndex(index)}
                aria-label={`Quantity for ${normalized[index].name}`}
              >
                {formatQuantity(quantities[index] ?? 1, units[index])}
              </button>
            )}
            onSelect={(_, index) => toggle(index)}
          />
          {editingIndex !== null && (
            <QuantitySheet
              quantity={quantities[editingIndex] ?? 1}
              unit={units[editingIndex] ?? ''}
              unitSuggestions={UNIT_SUGGESTIONS}
              onSave={(q, u) => {
                setQuantity(editingIndex, q);
                setUnit(editingIndex, u);
              }}
              onClose={() => setEditingIndex(null)}
            />
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display font-bold text-text text-base">Add to</h2>
          <ImportTargetPicker
            lists={lists ?? []}
            target={target}
            newListLabel={title ? `New list · ${title}` : 'New list'}
            onChange={setTarget}
          />

          {recipeTarget && (
            <div className="pt-1">
              <LabeledField
                htmlFor="recipe-servings"
                label="Servings"
                error={servingsValid ? undefined : 'Enter a serving count of 1 or more'}
              >
                <Input
                  id="recipe-servings"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={servings}
                  onChange={(event) => setServings(event.target.value)}
                  className="w-24"
                />
              </LabeledField>
            </div>
          )}
        </section>

        {commitError && (
          <p className="text-destructive text-sm">
            {recipeTarget
              ? 'Couldn’t save the recipe. Please try again.'
              : 'Couldn’t add the items. Please try again.'}
          </p>
        )}

        <Button
          variant="primary"
          className="w-full"
          disabled={committing || checkedCount === 0 || (recipeTarget && !servingsValid)}
          onClick={() => void commit()}
        >
          {recipeTarget
            ? committing
              ? 'Saving…'
              : 'Save recipe'
            : committing
              ? 'Adding…'
              : `Add ${checkedCount} ${checkedCount === 1 ? 'item' : 'items'}`}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="font-display font-bold text-text text-xl">Import from a recipe</h1>
        <p className="text-text-muted text-sm">Paste a recipe link to pull in its ingredients.</p>
      </header>

      <form className="flex flex-col gap-3" onSubmit={submitPaste}>
        <Input
          type="url"
          inputMode="url"
          placeholder="https://example.com/recipe"
          aria-label="Recipe URL"
          value={pasteValue}
          onChange={(event) => setPasteValue(event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={loading || !isValidRecipeUrl(pasteValue.trim())}
        >
          {loading ? 'Fetching…' : 'Import'}
        </Button>
      </form>

      {loading && (
        <p className="flex items-center gap-2 text-text-muted text-sm">
          <Spinner /> Fetching recipe…
        </p>
      )}

      {hasValidUrl && query.isError && !loading && (
        <p className="text-destructive text-sm">{ERROR_MESSAGES[query.error.code]}</p>
      )}
    </div>
  );
}
