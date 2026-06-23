import type { Aisle } from '@/db/schema';

/**
 * Canonical display label for an aisle. A numeric aisle gets the
 * "Aisle N — Label" form; a named section (non-numeric or empty `number`)
 * shows just its label. Single source of truth for all aisle labelling.
 */
export function formatAisleLabel(aisle: Pick<Aisle, 'number' | 'label'>): string {
  if (aisle.number && /^\d+$/.test(aisle.number)) {
    return `Aisle ${aisle.number} — ${aisle.label}`;
  }
  return aisle.label;
}
