import { useMemo, useState } from 'react';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import LabeledField from '@/components/molecules/LabeledField';
import { useEatProfile, useSetEatProfile } from '@/hooks/useEatProfile';
import { ACTIVITY_LABELS } from '@/services/nutritionTargets';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from '@/services/units';
import type { ActivityLevel, EatProfile, Sex, UnitSystem } from '@/db/schema';

/**
 * Profile capture/edit form (Eat tab, Phase 2). Seeds from the persisted profile
 * (metric-canonical) into the user's display units, holds the edit buffer in
 * LOCAL component state (ADR-0004: an unsaved form draft is ephemeral UI, not a
 * Zustand store), validates ranges, and on submit converts back to metric and
 * writes via `useSetEatProfile`. Reuses the `Input`/`Button` atoms and themes via
 * role tokens so it renders green under /eat.
 */

const ACTIVITY_LEVELS: ActivityLevel[] = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
];

// Validation bounds. Age is a direct range; weight/height are checked against the
// canonical METRIC value so the same sane bounds hold in either display system.
const AGE_MIN = 13;
const AGE_MAX = 100;
const WEIGHT_KG_MIN = 25;
const WEIGHT_KG_MAX = 300;
const HEIGHT_CM_MIN = 90;
const HEIGHT_CM_MAX = 250;

interface Draft {
  age: string;
  sex: Sex;
  activity: ActivityLevel;
  units: UnitSystem;
  weight: string; // lb (imperial) or kg (metric)
  heightCm: string; // metric only
  heightFt: string; // imperial only
  heightIn: string; // imperial only
}

const SELECT_CLASS =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-text focus:outline-none focus:ring-2 focus:ring-primary';

function numToStr(n: number): string {
  // Trim floating-point noise from conversions to a tidy one-decimal display.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** Build the initial display draft from a persisted (metric) profile, or blanks. */
function seedDraft(profile: EatProfile | null): Draft {
  const units: UnitSystem = profile?.units ?? 'imperial';
  if (!profile) {
    return {
      age: '',
      sex: 'female',
      activity: 'moderate',
      units,
      weight: '',
      heightCm: '',
      heightFt: '',
      heightIn: '',
    };
  }
  if (units === 'metric') {
    return {
      age: String(profile.age),
      sex: profile.sex,
      activity: profile.activity,
      units,
      weight: numToStr(profile.weightKg),
      heightCm: numToStr(profile.heightCm),
      heightFt: '',
      heightIn: '',
    };
  }
  const { feet, inches } = cmToFtIn(profile.heightCm);
  return {
    age: String(profile.age),
    sex: profile.sex,
    activity: profile.activity,
    units,
    weight: numToStr(kgToLb(profile.weightKg)),
    heightCm: '',
    heightFt: String(feet),
    heightIn: String(inches),
  };
}

/** Parse a draft's display fields into canonical metric, or null if unparseable. */
function draftToMetric(draft: Draft): { weightKg: number; heightCm: number } | null {
  const weight = Number(draft.weight);
  if (!draft.weight.trim() || Number.isNaN(weight)) return null;
  const weightKg = draft.units === 'metric' ? weight : lbToKg(weight);

  let heightCm: number;
  if (draft.units === 'metric') {
    const cm = Number(draft.heightCm);
    if (!draft.heightCm.trim() || Number.isNaN(cm)) return null;
    heightCm = cm;
  } else {
    const ft = Number(draft.heightFt);
    const inch = Number(draft.heightIn || '0');
    if (!draft.heightFt.trim() || Number.isNaN(ft) || Number.isNaN(inch)) return null;
    heightCm = ftInToCm(ft, inch);
  }
  return { weightKg, heightCm };
}

interface Validation {
  errors: { age?: string; weight?: string; height?: string };
  metric: { weightKg: number; heightCm: number } | null;
  age: number;
  isValid: boolean;
}

function validate(draft: Draft): Validation {
  const errors: Validation['errors'] = {};

  const age = Number(draft.age);
  if (!draft.age.trim() || Number.isNaN(age) || !Number.isInteger(age)) {
    errors.age = 'Enter your age';
  } else if (age < AGE_MIN || age > AGE_MAX) {
    errors.age = `Age must be ${AGE_MIN}–${AGE_MAX}`;
  }

  const metric = draftToMetric(draft);
  if (metric === null) {
    if (!draft.weight.trim()) errors.weight = 'Enter your weight';
    errors.height = errors.height ?? 'Enter your height';
  } else {
    if (metric.weightKg < WEIGHT_KG_MIN || metric.weightKg > WEIGHT_KG_MAX) {
      errors.weight = 'Enter a valid weight';
    }
    if (metric.heightCm < HEIGHT_CM_MIN || metric.heightCm > HEIGHT_CM_MAX) {
      errors.height = 'Enter a valid height';
    }
  }

  const isValid = Object.keys(errors).length === 0 && metric !== null;
  return { errors, metric, age, isValid };
}

/** Convert the visible numbers in place when the units toggle flips. */
function convertDraftUnits(draft: Draft, next: UnitSystem): Draft {
  if (draft.units === next) return draft;
  const metric = draftToMetric(draft);

  if (next === 'metric') {
    return {
      ...draft,
      units: next,
      weight: metric ? numToStr(metric.weightKg) : '',
      heightCm: metric ? numToStr(metric.heightCm) : '',
      heightFt: '',
      heightIn: '',
    };
  }
  const ftIn = metric ? cmToFtIn(metric.heightCm) : null;
  return {
    ...draft,
    units: next,
    weight: metric ? numToStr(kgToLb(metric.weightKg)) : '',
    heightCm: '',
    heightFt: ftIn ? String(ftIn.feet) : '',
    heightIn: ftIn ? String(ftIn.inches) : '',
  };
}

export interface EatProfileFormProps {
  /** Called after a successful save (e.g. to close the containing sheet). */
  onSaved?: () => void;
}

export default function EatProfileForm({ onSaved }: EatProfileFormProps) {
  const { data: profile } = useEatProfile();
  const setProfile = useSetEatProfile();

  const initial = useMemo(() => seedDraft(profile ?? null), [profile]);
  const [draft, setDraft] = useState<Draft>(initial);

  const { errors, metric, age, isValid } = validate(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const canSave = isValid && isDirty && !setProfile.isPending;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || metric === null) return;
    const next: EatProfile = {
      age,
      sex: draft.sex,
      weightKg: metric.weightKg,
      heightCm: metric.heightCm,
      activity: draft.activity,
      units: draft.units,
      updated_at: Date.now(),
    };
    setProfile.mutate(next, { onSuccess: () => onSaved?.() });
  }

  const weightSuffix = draft.units === 'metric' ? 'kg' : 'lb';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {/* Units toggle — converts the visible numbers in place. */}
      <div
        className="flex rounded-lg border border-border overflow-hidden"
        role="group"
        aria-label="Units"
      >
        {(['imperial', 'metric'] as UnitSystem[]).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={draft.units === u}
            onClick={() => setDraft((d) => convertDraftUnits(d, u))}
            className={`flex-1 px-3 py-2 text-sm font-semibold capitalize ${
              draft.units === u ? 'bg-primary text-primary-foreground' : 'bg-card text-text-muted'
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      <LabeledField htmlFor="profile-age" label="Age" suffix="years" error={errors.age}>
        <Input
          id="profile-age"
          type="number"
          inputMode="numeric"
          value={draft.age}
          onChange={(e) => update('age', e.target.value)}
          className="w-full"
        />
      </LabeledField>

      <LabeledField htmlFor="profile-sex" label="Sex">
        <select
          id="profile-sex"
          value={draft.sex}
          onChange={(e) => update('sex', e.target.value as Sex)}
          className={SELECT_CLASS}
        >
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </LabeledField>

      <LabeledField
        htmlFor="profile-weight"
        label="Weight"
        suffix={weightSuffix}
        error={errors.weight}
      >
        <Input
          id="profile-weight"
          type="number"
          inputMode="decimal"
          value={draft.weight}
          onChange={(e) => update('weight', e.target.value)}
          className="w-full"
        />
      </LabeledField>

      {draft.units === 'metric' ? (
        <LabeledField htmlFor="profile-height" label="Height" suffix="cm" error={errors.height}>
          <Input
            id="profile-height"
            type="number"
            inputMode="decimal"
            value={draft.heightCm}
            onChange={(e) => update('heightCm', e.target.value)}
            className="w-full"
          />
        </LabeledField>
      ) : (
        <LabeledField htmlFor="profile-height-ft" label="Height" error={errors.height}>
          <div className="flex items-center gap-2">
            <Input
              id="profile-height-ft"
              type="number"
              inputMode="numeric"
              aria-label="Height (feet)"
              value={draft.heightFt}
              onChange={(e) => update('heightFt', e.target.value)}
              className="w-full"
            />
            <span className="text-sm text-text-muted" aria-hidden="true">
              ft
            </span>
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Height (inches)"
              value={draft.heightIn}
              onChange={(e) => update('heightIn', e.target.value)}
              className="w-full"
            />
            <span className="text-sm text-text-muted" aria-hidden="true">
              in
            </span>
          </div>
        </LabeledField>
      )}

      <LabeledField htmlFor="profile-activity" label="Activity level">
        <select
          id="profile-activity"
          value={draft.activity}
          onChange={(e) => update('activity', e.target.value as ActivityLevel)}
          className={SELECT_CLASS}
        >
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LABELS[level]}
            </option>
          ))}
        </select>
      </LabeledField>

      <Button type="submit" variant="primary" disabled={!canSave}>
        Save profile
      </Button>
    </form>
  );
}
