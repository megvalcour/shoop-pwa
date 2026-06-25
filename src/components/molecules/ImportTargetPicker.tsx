import SelectionList from '@/components/molecules/SelectionList';
import type { ShoppingList } from '@/db/schema';

/** Where the imported ingredients should be committed. */
export type ImportTarget =
  | { kind: 'new' }
  | { kind: 'existing'; listId: string }
  | { kind: 'default' };

interface TargetOption {
  kind: ImportTarget['kind'];
  label: string;
}

export interface ImportTargetPickerProps {
  /** The user's existing lists; the "Existing list" option is hidden when empty. */
  lists: ShoppingList[];
  /** Currently selected target. */
  target: ImportTarget;
  /** Label for the "new list" option (carries the recipe title when known). */
  newListLabel: string;
  onChange: (target: ImportTarget) => void;
}

/**
 * Presentational chooser for the recipe-import destination: a new list, one of
 * the user's existing lists, or the default list. Pure — the owning organism
 * supplies the lists and selected target and handles the commit (CLAUDE.md:
 * molecules don't touch stores). Reuses the `SelectionList` molecule for both
 * the option list and the nested existing-list picker.
 */
export default function ImportTargetPicker({
  lists,
  target,
  newListLabel,
  onChange,
}: ImportTargetPickerProps) {
  const options: TargetOption[] = [
    { kind: 'new', label: newListLabel },
    ...(lists.length > 0 ? [{ kind: 'existing' as const, label: 'Existing list' }] : []),
    { kind: 'default', label: 'Default list' },
  ];

  function selectKind(kind: ImportTarget['kind']) {
    if (kind === 'existing') {
      const listId = target.kind === 'existing' ? target.listId : lists[0].id;
      onChange({ kind: 'existing', listId });
    } else {
      onChange({ kind });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SelectionList
        items={options}
        getKey={(option) => option.kind}
        isSelected={(option) => option.kind === target.kind}
        renderLabel={(option) => option.label}
        onSelect={(option) => selectKind(option.kind)}
      />

      {target.kind === 'existing' && (
        <div className="ml-4 border-l border-border pl-2">
          <SelectionList
            items={lists}
            getKey={(list) => list.id}
            isSelected={(list) => list.id === target.listId}
            renderLabel={(list) => list.name}
            onSelect={(list) => onChange({ kind: 'existing', listId: list.id })}
          />
        </div>
      )}
    </div>
  );
}
