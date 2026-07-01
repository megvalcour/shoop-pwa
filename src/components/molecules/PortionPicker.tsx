/**
 * Portion chooser (Eat tab, Phase 4.1 — ADR-0005). Turns the bare "type a gram
 * weight you don't know" prompt into picking a REAL household measure: the matched
 * FDC food's `foodPortions` render as tappable chips ("1 cup — 240 g") with a
 * quantity stepper and a live gram preview, so the user sizes an ingredient in
 * units they understand. A raw-grams entry survives as the last-resort fallback
 * (and is the only mode when the food carries no portions).
 *
 * Presentational: the parent (`RecipeNutrition`) owns the persist mutation and just
 * receives the resolved TOTAL grams via `onPick`. Selection/stepper/mode are local
 * ephemeral UI state. Reuses the `Button`/`Input` atoms; role tokens only, so it
 * themes green under /eat (ADR-0028).
 */

import { useState } from 'react';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import type { FdcPortion } from '@/db/schema';

export interface PortionPickerProps {
  /** Household portions from the matched food; when empty, only grams entry shows. */
  portions: FdcPortion[];
  /** Called with the resolved TOTAL grams when the user commits a pick or a value. */
  onPick: (grams: number) => void;
  /** True while the parent persists, to disable re-taps. */
  isSaving?: boolean;
  /** Prefills the grams fallback (e.g. the current estimate being adjusted). */
  initialGrams?: number;
}

function portionGrams(portion: FdcPortion): number {
  return portion.gramWeight > 0 ? portion.gramWeight : 0;
}

function portionLabel(portion: FdcPortion): string {
  const amount = portion.amount > 0 ? portion.amount : 1;
  return `${amount} ${portion.unit} — ${Math.round(portionGrams(portion))} g`;
}

export default function PortionPicker({
  portions,
  onPick,
  isSaving = false,
  initialGrams,
}: PortionPickerProps) {
  const hasPortions = portions.length > 0;
  const [mode, setMode] = useState<'portion' | 'grams'>(hasPortions ? 'portion' : 'grams');
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(1);
  const [gramsText, setGramsText] = useState(
    initialGrams !== undefined ? String(Math.round(initialGrams)) : '',
  );

  if (mode === 'portion' && hasPortions) {
    const chosen = portions[selected] ?? portions[0];
    const total = portionGrams(chosen) * count;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {portions.map((portion, index) => (
            <button
              key={`${portion.unit}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={index === selected}
              className={`rounded-full px-3 py-1 text-xs border ${
                index === selected
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border bg-card text-text-muted'
              }`}
            >
              {portionLabel(portion)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2">
            <Button
              variant="secondary"
              shape="icon"
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              aria-label="Fewer"
              className="w-7 h-7"
            >
              −
            </Button>
            <span className="min-w-6 text-center text-text text-sm" aria-label="Quantity">
              {count}
            </span>
            <Button
              variant="secondary"
              shape="icon"
              onClick={() => setCount((c) => c + 1)}
              aria-label="More"
              className="w-7 h-7"
            >
              +
            </Button>
          </div>
          <span className="text-text-muted text-sm">= {Math.round(total)} g</span>
          <Button
            variant="primary"
            onClick={() => total > 0 && onPick(total)}
            disabled={isSaving || total <= 0}
            className="ml-auto text-xs px-2 py-1"
          >
            Use
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={() => setMode('grams')}
          className="self-start text-xs"
        >
          Enter grams instead
        </Button>
      </div>
    );
  }

  const grams = Number(gramsText);
  const gramsValid = Number.isFinite(grams) && grams > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={gramsText}
          onChange={(e) => setGramsText(e.target.value)}
          aria-label="Grams"
          className="w-24"
        />
        <span className="text-text-muted text-sm">g</span>
        <Button
          variant="primary"
          onClick={() => gramsValid && onPick(grams)}
          disabled={isSaving || !gramsValid}
          className="text-xs px-2 py-1"
        >
          Save
        </Button>
      </div>
      {hasPortions && (
        <Button variant="ghost" onClick={() => setMode('portion')} className="self-start text-xs">
          Back to measures
        </Button>
      )}
    </div>
  );
}
