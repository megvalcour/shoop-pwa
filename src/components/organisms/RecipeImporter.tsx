import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import Spinner from '@/components/atoms/Spinner';
import SelectionList from '@/components/molecules/SelectionList';
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
import { normalizeIngredient, UNIT_SUGGESTIONS } from '@/utils/normalizeIngredient';

/** Datalist id for the shared per-row unit suggestions. */
const UNIT_DATALIST_ID = 'recipe-import-units';

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

  const normalized = useMemo(
    () => (query.data?.ingredients ?? []).map((raw) => normalizeIngredient(raw)),
    [query.data],
  );

  // Everything checked by default; reset whenever a fresh recipe loads.
  const [checked, setChecked] = useState<Set<number>>(new Set());
  // Optional per-row unit, indexed alongside `normalized`; '' means omit on commit.
  const [units, setUnits] = useState<string[]>([]);
  useEffect(() => {
    setChecked(new Set(normalized.map((_, index) => index)));
    setUnits(normalized.map(() => ''));
  }, [normalized]);

  const [target, setTarget] = useState<ImportTarget>({ kind: 'new' });
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState(false);

  const hasValidUrl = isValidRecipeUrl(url);
  const loading = hasValidUrl && query.isFetching && !query.data;
  const ready = query.isSuccess && query.data;
  const title = query.data?.title ?? null;

  function toggle(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
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
      .map((ingredient, index) => ({ ingredient, unit: units[index]?.trim() || undefined }))
      .filter((_, index) => checked.has(index));
    if (selected.length === 0) return;

    setCommitting(true);
    setCommitError(false);
    try {
      if (target.kind === 'default') {
        for (const { ingredient, unit } of selected) {
          await addDefaultItem.mutateAsync({ name: ingredient.name, unit });
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

      for (const { ingredient, unit } of selected) {
        await addListItem.mutateAsync({ listId, name: ingredient.name, unit });
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
              <Input
                className="w-20 text-sm"
                list={UNIT_DATALIST_ID}
                placeholder="unit"
                aria-label={`Unit for ${normalized[index].name}`}
                value={units[index] ?? ''}
                onChange={(event) => setUnit(index, event.target.value)}
              />
            )}
            onSelect={(_, index) => toggle(index)}
          />
          <datalist id={UNIT_DATALIST_ID}>
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display font-bold text-text text-base">Add to</h2>
          <ImportTargetPicker
            lists={lists ?? []}
            target={target}
            newListLabel={title ? `New list · ${title}` : 'New list'}
            onChange={setTarget}
          />
        </section>

        {commitError && (
          <p className="text-destructive text-sm">Couldn’t add the items. Please try again.</p>
        )}

        <Button
          variant="primary"
          className="w-full"
          disabled={committing || checkedCount === 0}
          onClick={() => void commit()}
        >
          {committing ? 'Adding…' : `Add ${checkedCount} ${checkedCount === 1 ? 'item' : 'items'}`}
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
