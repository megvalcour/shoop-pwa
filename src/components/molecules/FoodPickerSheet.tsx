/**
 * Manual FDC food picker (Eat tab, Phase 4): a BottomSheet listing the search
 * candidates for one ingredient so the user can correct a low-confidence auto-match
 * or pick when the matcher was unsure. Presentational — the `RecipeNutrition`
 * organism owns the candidate query and the pick mutation; this just renders state
 * and reports the chosen fdcId. Reuses the shared `BottomSheet` + `SelectionList`
 * molecules and `Badge`/`Spinner` atoms (ADR-0005).
 */

import BottomSheet from '@/components/molecules/BottomSheet';
import SelectionList from '@/components/molecules/SelectionList';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';
import type { FdcCandidate } from '@/hooks/useNutrition';

export interface FoodPickerSheetProps {
  ingredientName: string;
  candidates: FdcCandidate[];
  isLoading: boolean;
  isError: boolean;
  selectedFdcId?: string;
  /** True while a pick is being persisted, to disable re-taps. */
  isPicking?: boolean;
  onPick: (fdcId: string) => void;
  onClose: () => void;
}

export default function FoodPickerSheet({
  ingredientName,
  candidates,
  isLoading,
  isError,
  selectedFdcId,
  isPicking = false,
  onPick,
  onClose,
}: FoodPickerSheetProps) {
  return (
    <BottomSheet title={`Match “${ingredientName}”`} onClose={onClose}>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
          <Spinner aria-label="Searching foods" />
          <span className="text-sm">Searching foods…</span>
        </div>
      ) : isError ? (
        <p className="px-4 py-8 text-center text-text-muted text-sm">
          Couldn’t search for foods. Check your connection and try again.
        </p>
      ) : candidates.length === 0 ? (
        <p className="px-4 py-8 text-center text-text-muted text-sm">
          No matching foods found for this ingredient.
        </p>
      ) : (
        <SelectionList
          items={candidates}
          getKey={(candidate) => candidate.fdcId}
          isSelected={(candidate) => candidate.fdcId === selectedFdcId}
          onSelect={(candidate) => !isPicking && onPick(candidate.fdcId)}
          renderLabel={(candidate) => (
            <span className="flex flex-col min-w-0">
              <span className="truncate">{candidate.description}</span>
              {candidate.dataType && (
                <Badge variant="muted" className="mt-1 self-start">
                  {candidate.dataType}
                </Badge>
              )}
            </span>
          )}
        />
      )}
    </BottomSheet>
  );
}
