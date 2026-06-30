/**
 * Pure, network-free mapping of a USDA FoodData Central food JSON into the
 * internal nutrient panel Shoop caches and rolls up (Eat tab, Phase 4 — ADR-0027).
 * Used by the `/api/nutrition` Pages Function `detail` op and unit-tested in
 * isolation against captured FDC fixtures (no fetch, no DOM).
 *
 * FDC's `/v1/food/{id}` returns a `foodNutrients[]` array whose amounts are per
 * 100 g for the SR Legacy / Foundation / Branded datasets we query. The nutrient
 * is identified by a stable numeric id; the encoding varies by dataset (nested
 * `{ nutrient: { id }, amount }` for full detail, flat `{ nutrientId, value }`
 * for the abridged shape), so the reader tolerates both. `foodPortions[]` carry
 * household-measure → gram weights used by the count/container gram path.
 *
 * The output interface is mirrored verbatim by `FdcNutrientPanel` in
 * `src/db/schema.ts` (the client's cached copy). The two module trees can't share
 * an import — functions build under `tsconfig.functions.json` with no `@` alias —
 * so any change here MUST be mirrored there, and vice versa.
 */

/** A single household-measure portion: how many grams `amount` of `unit` weighs. */
export interface FdcPortion {
  unit: string;
  gramWeight: number;
  amount: number;
}

/** Per-100 g nutrient panel + portions. Keys match `nutritionTargets`' micro keys. */
export interface FdcNutrientPanel {
  fdc_id: string;
  description: string;
  per100g: {
    energyKcal: number;
    protein: number; // g
    fat: number; // g
    carbs: number; // g
    fiber: number; // g
    sodium: number; // mg
    calcium: number; // mg
    iron: number; // mg
    potassium: number; // mg
    vitaminC: number; // mg
    vitaminD: number; // mcg
  };
  foodPortions?: FdcPortion[];
}

/**
 * The stable USDA FDC nutrient ids for the curated panel. The same ids appear
 * across SR Legacy / Foundation / Branded, so one map covers every dataset.
 * Energy resolves to id 1008 ("Energy", kcal); some foods also carry Atwater
 * energies (2047/2048) and kJ (1062), handled by the unit fallback below.
 */
const NUTRIENT_IDS = {
  energyKcal: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sodium: 1093,
  calcium: 1087,
  iron: 1089,
  potassium: 1092,
  vitaminC: 1162,
  vitaminD: 1114,
} as const;

type PanelKey = keyof typeof NUTRIENT_IDS;

interface RawNutrient {
  nutrient?: { id?: number; name?: string; unitName?: string };
  nutrientId?: number;
  nutrientName?: string;
  unitName?: string;
  amount?: number;
  value?: number;
}

interface RawPortion {
  modifier?: string;
  gramWeight?: number;
  amount?: number;
  measureUnit?: { name?: string };
}

interface RawFood {
  fdcId?: number | string;
  description?: string;
  foodNutrients?: RawNutrient[];
  foodPortions?: RawPortion[];
}

/** Read a nutrient row's id, tolerating the nested and flat FDC encodings. */
function nutrientId(row: RawNutrient): number | undefined {
  return row.nutrient?.id ?? row.nutrientId;
}

/** Read a nutrient row's amount, tolerating the `amount` / `value` encodings. */
function nutrientAmount(row: RawNutrient): number {
  const raw = row.amount ?? row.value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

/** Read a nutrient row's unit string (`KCAL`, `G`, `MG`…), case-insensitive. */
function nutrientUnit(row: RawNutrient): string {
  return (row.nutrient?.unitName ?? row.unitName ?? '').toUpperCase();
}

/**
 * Resolve a household portion's unit label. Prefer the structured
 * `measureUnit.name` (e.g. "cup"); fall back to the free-text `modifier`
 * (e.g. "clove") when the measure unit is the FDC "undetermined"/"unit"
 * placeholder. Lower-cased so the gram path can match it against unit tokens.
 */
function portionUnit(portion: RawPortion): string {
  const measure = portion.measureUnit?.name?.trim().toLowerCase() ?? '';
  if (measure && measure !== 'undetermined' && measure !== 'unit') return measure;
  return portion.modifier?.trim().toLowerCase() ?? '';
}

/**
 * Map an FDC food JSON to the internal {@link FdcNutrientPanel}. Missing
 * nutrients default to 0 (a food legitimately containing none of a nutrient and
 * a food whose row is absent both read 0 — acceptable for a rollup). Returns
 * `null` only when the input has no usable id, so the caller can answer 422.
 */
export function parseFdcFood(food: unknown): FdcNutrientPanel | null {
  if (!food || typeof food !== 'object') return null;
  const raw = food as RawFood;

  const fdcId = raw.fdcId;
  if (fdcId === undefined || fdcId === null || `${fdcId}`.length === 0) return null;

  const rows = Array.isArray(raw.foodNutrients) ? raw.foodNutrients : [];

  // Index amounts by nutrient id for a single pass over the panel keys.
  const byId = new Map<number, RawNutrient>();
  let kcalFallback: number | undefined;
  for (const row of rows) {
    const id = nutrientId(row);
    if (id === undefined) continue;
    if (!byId.has(id)) byId.set(id, row);
    // Capture any KCAL-unit energy as a fallback when id 1008 is absent.
    if (kcalFallback === undefined && nutrientUnit(row) === 'KCAL') {
      kcalFallback = nutrientAmount(row);
    }
  }

  const per100g = {} as FdcNutrientPanel['per100g'];
  for (const key of Object.keys(NUTRIENT_IDS) as PanelKey[]) {
    const row = byId.get(NUTRIENT_IDS[key]);
    per100g[key] = row ? nutrientAmount(row) : 0;
  }
  if (per100g.energyKcal === 0 && kcalFallback !== undefined) {
    per100g.energyKcal = kcalFallback;
  }

  const portions = (Array.isArray(raw.foodPortions) ? raw.foodPortions : [])
    .map((portion) => ({
      unit: portionUnit(portion),
      gramWeight: typeof portion.gramWeight === 'number' ? portion.gramWeight : 0,
      amount: typeof portion.amount === 'number' && portion.amount > 0 ? portion.amount : 1,
    }))
    .filter((portion) => portion.unit.length > 0 && portion.gramWeight > 0);

  return {
    fdc_id: `${fdcId}`,
    description: typeof raw.description === 'string' ? raw.description : '',
    per100g,
    ...(portions.length > 0 ? { foodPortions: portions } : {}),
  };
}
